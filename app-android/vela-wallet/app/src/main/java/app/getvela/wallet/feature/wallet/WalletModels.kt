package app.getvela.wallet.feature.wallet

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color

/**
 * Wallet view models (spec 015, data-model.md — Android port of the web's
 * `src/lib/wallet/model.ts`).
 *
 * Components consume ONLY these display-ready shapes — no service types, no
 * formatting, no fetching (spec FR-005 / SC-005). A later "real data" feature
 * replaces the fixture layer that builds them and nothing else.
 */

enum class WalletScreenState { H1, H1S, H2, H3, H4, H5, H6, H7, H7X, H8 }

@Immutable
data class WalletHeaderModel(
    val name: String,
    val addressDisplay: String,
    /** Identicon seed (the full address); rendered via core/identicon. */
    val identiconSeed: String,
)

@Immutable
sealed interface NetworkPillModel {
    data class All(val dots: List<Color>, val label: String) : NetworkPillModel
    data class Single(val dot: Color, val label: String) : NetworkPillModel
}

enum class BalanceStateKind { Normal, ZeroLive, Loading, Hidden }

enum class BalanceStatusKind { Warning, Refreshing }

@Immutable
data class BalanceStatusModel(val kind: BalanceStatusKind, val text: String)

@Immutable
data class BalanceModel(
    val label: String,
    val currency: String,
    val state: BalanceStateKind,
    /** e.g. "$1,383" — null while loading; mask dots while hidden. */
    val integer: String? = null,
    /** e.g. "28" — rendered de-emphasised after the separator. */
    val decimals: String? = null,
    val liveText: String? = null,
    val status: BalanceStatusModel? = null,
    val a11yHide: String,
    val a11yShow: String,
)

enum class ActivityKind { Sent, Received, Dapp }

@Immutable
data class ActivityRowModel(
    val kind: ActivityKind,
    val title: String,
    val subtitle: String,
    val amount: String,
    val unit: String,
    val positive: Boolean,
    val masked: Boolean,
    val badgeColor: Color,
)

@Immutable
data class ActivityGroupModel(val label: String, val rows: List<ActivityRowModel>)

@Immutable
sealed interface AssetFiatModel {
    data class Value(val text: String) : AssetFiatModel
    data class NoPrice(val text: String) : AssetFiatModel
    data object Masked : AssetFiatModel
}

@Immutable
data class AssetRowModel(
    val ticker: String,
    val chain: String,
    val badgeColor: Color,
    val balance: String,
    val fiat: AssetFiatModel,
    val masked: Boolean,
)

enum class SectionMode { Rows, Empty, Loading }

@Immutable
data class EmptyStateModel(val title: String, val caption: String)

@Immutable
data class SectionModel(
    val title: String,
    val action: String,
    val mode: SectionMode,
    val empty: EmptyStateModel? = null,
)

@Immutable
data class ChainRowModel(
    val name: String,
    /** null = the all-networks row (neutral dot). */
    val dot: Color?,
    val count: Int,
    val selected: Boolean,
)

@Immutable
data class SheetModel(val title: String, val rows: List<ChainRowModel>)

@Immutable
data class TabsModel(
    val wallet: String,
    val contacts: String,
    val explore: String,
    val settings: String,
)

@Immutable
data class ActionsModel(val receive: String, val send: String, val scan: String)

@Immutable
data class WalletHomeModel(
    val state: WalletScreenState,
    val header: WalletHeaderModel,
    val pill: NetworkPillModel,
    val balance: BalanceModel,
    val actions: ActionsModel,
    val activitySection: SectionModel,
    val activityGroups: List<ActivityGroupModel>,
    val assetsSection: SectionModel,
    val assetRows: List<AssetRowModel>,
    val tabs: TabsModel,
    val sheet: SheetModel? = null,
    /** 1 or 1.35 — multiplies the font scale via LocalDensity (spec FR-011). */
    val textScale: Float = 1f,
)
