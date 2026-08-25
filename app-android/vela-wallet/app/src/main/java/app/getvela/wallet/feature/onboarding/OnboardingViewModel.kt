package app.getvela.wallet.feature.onboarding

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.getvela.wallet.VelaWalletApplication
import app.getvela.wallet.feature.onboarding.core.AccountStore
import app.getvela.wallet.feature.onboarding.core.CoreDriver
import app.getvela.wallet.feature.onboarding.core.CreateView
import app.getvela.wallet.feature.onboarding.core.KeyMethod
import app.getvela.wallet.feature.onboarding.core.LoginView
import app.getvela.wallet.feature.onboarding.core.OnboardingExecutor
import app.getvela.wallet.feature.onboarding.core.PasskeyExecutor
import app.getvela.wallet.feature.onboarding.core.PromptKind
import app.getvela.wallet.feature.onboarding.core.RegistryClient
import app.getvela.wallet.feature.onboarding.core.SessionController
import app.getvela.wallet.feature.onboarding.core.asBridge
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.launch
import org.json.JSONObject
import uniffi.vela_core_uniffi.CreateWalletCore
import uniffi.vela_core_uniffi.LoginCore

/**
 * Both onboarding machines, and the one Activity-scoped thing they need.
 *
 * `AndroidViewModel` rather than `ViewModel` because a passkey ceremony needs an
 * Activity context — Credential Manager raises system UI, which cannot be done
 * from an application context. The Activity is supplied per call by the screen
 * (see [attach]) rather than held here, because holding one in a ViewModel that
 * survives rotation is a leaked Activity.
 *
 * The two machines are separate cores with separate drivers and ONE executor
 * between them: six of the eighteen operations are used by both flows, and the
 * contract is a single vocabulary. Two executors would be two places for those
 * six to drift.
 */
class OnboardingViewModel(application: Application) : AndroidViewModel(application) {

    private val container = (application as VelaWalletApplication).container
    private val store: AccountStore = container.accountStore
    private val session: SessionController = container.session

    /** The relying party and every ceremony. Rebuilt per attached Activity. */
    private var passkey: PasskeyExecutor? = null
    private val registry = RegistryClient()

    private var createDriver: CoreDriver? = null
    private var loginDriver: CoreDriver? = null

    /** The create machine's view; null until the flow has started. */
    var createView by mutableStateOf<CreateView?>(null)
        private set

    var loginView by mutableStateOf(LoginView(busy = false, endpointUnreachable = false))
        private set

    /** The prompt currently on screen, and the answer it is waiting for. */
    var pending by mutableStateOf<PendingPrompt?>(null)
        private set

    /** Non-null once onboarding is over — the host navigates and clears it. */
    var finished by mutableStateOf(false)
        private set

    /** The endpoint surface, opened by `endpoint_unreachable` or by hand. */
    var endpointSheetOpen by mutableStateOf(false)
        private set

    var endpointUrl by mutableStateOf(RegistryClient.DEFAULT_REGISTRY_URL)
        private set

    /** A shell fault. Never a user error — it means this app has a bug. */
    var fault by mutableStateOf<String?>(null)
        private set

    data class PendingPrompt(
        val kind: PromptKind,
        val confirmable: Boolean,
        val answer: CompletableDeferred<Boolean>,
    )

    init {
        viewModelScope.launch {
            // The stored override, applied before any machine can ask a
            // question: a flow that started against the default and then
            // switched mid-way would query two different registries for one
            // wallet.
            endpointUrl = session.registryUrl()
            registry.baseUrl = endpointUrl
        }
    }

    /**
     * Bind the ceremonies to a live Activity.
     *
     * Called from the composition on every entry. Cheap and idempotent — it
     * rebuilds only the passkey executor, which holds the context.
     */
    fun attach(activityContext: android.content.Context) {
        if (passkey == null) passkey = PasskeyExecutor(activityContext)
    }

    // -- create --------------------------------------------------------------

    fun startCreate() {
        if (createDriver != null) return
        val driver = CoreDriver(
            bridge = CreateWalletCore().asBridge(),
            scope = viewModelScope,
            perform = { operation -> executor().perform(operation) },
            onView = { json -> createView = CreateView.from(json) },
            onFault = { error -> fault = error.message ?: error.toString() },
        )
        createDriver = driver
        driver.dispatch(event("start"))
    }

    fun nameChanged(name: String) =
        send(createDriver, JSONObject().put("type", "name_changed").put("name", name))

    fun ackToggled(index: Int) =
        send(createDriver, JSONObject().put("type", "ack_toggled").put("index", index))

    fun submit() = send(createDriver, JSONObject().put("type", "submit"))

    fun addKey(method: KeyMethod) = send(
        createDriver,
        JSONObject().put("type", "add_key").put("name", "").put("method", method.wire),
    )

    fun confirmKey(index: Int) =
        send(createDriver, JSONObject().put("type", "confirm_key").put("index", index))

    fun removeKey(index: Int) =
        send(createDriver, JSONObject().put("type", "remove_key").put("index", index))

    fun finishKeys() = send(createDriver, JSONObject().put("type", "finish_keys"))

    fun startOver() = send(createDriver, JSONObject().put("type", "start_over"))

    fun retryUpload() = send(createDriver, JSONObject().put("type", "retry_upload"))

    fun enterWallet() = send(createDriver, JSONObject().put("type", "enter_wallet"))

    fun goBack() = send(createDriver, JSONObject().put("type", "go_back"))

    // -- sign in -------------------------------------------------------------

    fun startLogin() {
        if (loginDriver != null) return
        val driver = CoreDriver(
            bridge = LoginCore().asBridge(),
            scope = viewModelScope,
            perform = { operation -> executor().perform(operation) },
            onView = { json ->
                val next = LoginView.from(json)
                // The endpoint surface opens the moment the health probe says
                // the index is unreachable — and sign-in stays permitted while
                // it is open. It is a warning with a fix attached, not a gate.
                if (next.endpointUnreachable && !loginView.endpointUnreachable) {
                    endpointSheetOpen = true
                }
                loginView = next
            },
            onFault = { error -> fault = error.message ?: error.toString() },
        )
        loginDriver = driver
        driver.dispatch(event("start"))
    }

    fun signIn() = send(loginDriver, JSONObject().put("type", "sign_in"))

    // -- prompts -------------------------------------------------------------

    fun answerPrompt(accepted: Boolean) {
        val prompt = pending ?: return
        pending = null
        prompt.answer.complete(accepted)
    }

    // -- endpoint ------------------------------------------------------------

    fun openEndpointSheet() {
        endpointSheetOpen = true
    }

    fun dismissEndpointSheet() {
        endpointSheetOpen = false
    }

    fun saveEndpoint(url: String) {
        endpointSheetOpen = false
        val normalized = RegistryClient.normalize(url)
        endpointUrl = normalized
        registry.baseUrl = normalized
        viewModelScope.launch { session.setRegistryUrl(normalized) }
    }

    // -- lifecycle -----------------------------------------------------------

    /**
     * Leave the create flow.
     *
     * The driver is disposed and dropped rather than kept for a later re-entry:
     * a create machine holds drafted passkeys, and reusing one across an exit
     * would show the person a half-built wallet they thought they had abandoned.
     * Re-entering starts a fresh core — which finds any real draft in storage.
     */
    fun disposeCreate() {
        createDriver?.dispose()
        createDriver = null
        createView = null
    }

    fun disposeLogin() {
        loginDriver?.dispose()
        loginDriver = null
    }

    fun consumeFinished() {
        finished = false
    }

    private fun executor(): OnboardingExecutor {
        val ceremonies = passkey ?: error("onboarding executor used before attach()")
        return OnboardingExecutor(
            passkey = ceremonies,
            registry = registry,
            store = store,
            deps = object : OnboardingExecutor.Deps {
                override suspend fun prompt(kind: PromptKind, confirmable: Boolean): Boolean {
                    val answer = CompletableDeferred<Boolean>()
                    pending = PendingPrompt(kind, confirmable, answer)
                    return answer.await()
                }

                override suspend fun complete(mode: JSONObject) {
                    // Straight through to the session machine, untouched. The
                    // onboarding core is finished; whether there is a wallet to
                    // route to is the session machine's ruling, not this
                    // ViewModel's.
                    session.accountEstablished(mode)
                    finished = true
                }
            },
        )
    }

    private fun send(driver: CoreDriver?, event: JSONObject) {
        driver?.dispatch(event.toString())
    }

    private fun event(type: String): String = JSONObject().put("type", type).toString()
}
