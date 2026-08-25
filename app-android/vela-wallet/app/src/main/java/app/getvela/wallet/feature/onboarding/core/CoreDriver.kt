package app.getvela.wallet.feature.onboarding.core

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject
import uniffi.vela_core_uniffi.CreateWalletCore
import uniffi.vela_core_uniffi.LoginCore
import uniffi.vela_core_uniffi.SessionCore

/**
 * Platform-shell plumbing for a Crux core, blind to product semantics.
 *
 * It knows how to dispatch an event, perform the effects that come back, and
 * hand the answers to the core. It knows nothing about wallets — which is why
 * the create machine, the login machine and the session machine all share it
 * instead of each screen re-deriving the same failure and cancellation rules.
 *
 * ```text
 *   ViewModel                CoreDriver               executor
 *       │ dispatch(event) ───────►│
 *       │                         │ perform(operation) ──────►│  (a Job each)
 *       │◄──── onView(view) ──────│◄─────────── result json ──│
 *       │                         │ resolveEffect(id, result) …until it drains
 * ```
 *
 * Three properties are the whole contract, and each is a bug that is easy to
 * write and hard to see:
 *
 * 1. **Bridge calls are serialized.** `dispatch` and `resolveEffect` both mutate
 *    the core and both emit a view. Two coroutines resolving at the same instant
 *    would interleave their `onView` calls, and the LAST one to arrive — not the
 *    latest state — would be what the screen renders. The gate makes the order
 *    the core's, not the scheduler's.
 * 2. **Nothing thrown by an executor reaches the loop.** `perform` owes a result
 *    variant for every failure; if one still escapes, it is a shell bug and the
 *    loop reports it through `onFault` rather than dying and leaving the core
 *    waiting forever on an effect nobody will answer.
 * 3. **A cancelled effect is not answered.** The core asked for it to be
 *    abandoned, so it is not waiting — resolving it would push a stale answer
 *    into a machine that moved on.
 */
class CoreDriver(
    private val bridge: CoreBridge,
    private val scope: CoroutineScope,
    /** Perform one operation and return the result JSON. Must not throw. */
    private val perform: suspend (operation: JSONObject) -> String,
    /** Called on every committed view, in the order the core produced them. */
    private val onView: (JSONObject) -> Unit,
    /** A shell fault: a malformed event, an escaped exception. Never a user error. */
    private val onFault: (Throwable) -> Unit = {},
) {
    private val gate = Mutex()
    private val running = mutableMapOf<ULong, Job>()
    private var disposed = false

    /** Emit the core's current view without sending anything. */
    fun start() {
        scope.launch {
            gate.withLock {
                runCatching { JSONObject(bridge.view()) }
                    .onSuccess(::commit)
                    .onFailure(onFault)
            }
        }
    }

    /** Send one event, as the JSON the core's `Event` deserializes from. */
    fun dispatch(eventJson: String) {
        scope.launch {
            gate.withLock {
                runCatching { JSONObject(bridge.dispatch(eventJson)) }
                    .onSuccess(::apply)
                    .onFailure(onFault)
            }
        }
    }

    /**
     * Stop driving. In-flight effects are cancelled and their answers dropped:
     * a view produced after the screen has gone has nowhere to render.
     */
    fun dispose() {
        disposed = true
        running.values.forEach { it.cancel() }
        running.clear()
    }

    // -- the loop ------------------------------------------------------------

    /** Caller holds [gate]. */
    private fun apply(result: JSONObject) {
        commit(result.optJSONObject("view") ?: JSONObject())

        result.optJSONArray("cancelled_effect_ids")?.let { cancelled ->
            for (i in 0 until cancelled.length()) {
                val id = cancelled.optLong(i).toULong()
                running.remove(id)?.cancel()
            }
        }

        for (effect in result.optJSONArray("effects").objects()) {
            val id = effect.optLong("id").toULong()
            val operation = effect.optJSONObject("operation") ?: continue
            run(id, operation)
        }
    }

    private fun commit(view: JSONObject) {
        // A view produced before disposal can still arrive after it (an effect
        // resolving while the screen unmounts). Dropping it keeps the UI from
        // being asked to render into a torn-down tree.
        if (!disposed) onView(view)
    }

    private fun run(id: ULong, operation: JSONObject) {
        if (disposed) return
        val job = scope.launch {
            val resultJson = try {
                perform(operation)
            } catch (cancellation: CancellationException) {
                // Property 3: the core abandoned this operation. It is not
                // waiting for an answer, and giving it one would be the bug.
                running.remove(id)
                throw cancellation
            } catch (error: Throwable) {
                // Property 2. The executor owes a variant for every expected
                // failure, so reaching here means a shell bug — but the core
                // must still be unblocked, or the flow stops with a spinner.
                onFault(error)
                OnboardingExecutor.escapedFailure(operation, error)
            }
            running.remove(id)
            resolve(id, resultJson)
        }
        running[id] = job
    }

    private suspend fun resolve(id: ULong, resultJson: String) {
        gate.withLock {
            if (disposed) return
            runCatching { JSONObject(bridge.resolveEffect(id, resultJson)) }
                .onSuccess(::apply)
                .onFailure(onFault)
        }
    }
}

/**
 * The three bridge methods, without caring which machine is behind them.
 *
 * uniffi generates one class per exported object with no shared supertype, so
 * this interface is what lets [CoreDriver] be written once. The adapters below
 * are the entire binding surface the app has to the onboarding cores.
 */
interface CoreBridge {
    fun dispatch(eventJson: String): String
    fun resolveEffect(effectId: ULong, resultJson: String): String
    fun view(): String
}

fun CreateWalletCore.asBridge(): CoreBridge = object : CoreBridge {
    override fun dispatch(eventJson: String) = this@asBridge.dispatch(eventJson)
    override fun resolveEffect(effectId: ULong, resultJson: String) =
        this@asBridge.resolveEffect(effectId, resultJson)
    override fun view() = this@asBridge.view()
}

fun LoginCore.asBridge(): CoreBridge = object : CoreBridge {
    override fun dispatch(eventJson: String) = this@asBridge.dispatch(eventJson)
    override fun resolveEffect(effectId: ULong, resultJson: String) =
        this@asBridge.resolveEffect(effectId, resultJson)
    override fun view() = this@asBridge.view()
}

fun SessionCore.asBridge(): CoreBridge = object : CoreBridge {
    override fun dispatch(eventJson: String) = this@asBridge.dispatch(eventJson)
    override fun resolveEffect(effectId: ULong, resultJson: String) =
        this@asBridge.resolveEffect(effectId, resultJson)
    override fun view() = this@asBridge.view()
}
