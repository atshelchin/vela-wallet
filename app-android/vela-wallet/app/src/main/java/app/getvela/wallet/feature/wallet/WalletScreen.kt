package app.getvela.wallet.feature.wallet

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import app.getvela.wallet.core.designsystem.components.VelaIcons
import app.getvela.wallet.core.designsystem.theme.VelaTheme
import app.getvela.wallet.core.designsystem.tokens.VelaSizing
import app.getvela.wallet.core.designsystem.tokens.VelaSpacing
import app.getvela.wallet.feature.wallet.components.ActionButtonRow
import app.getvela.wallet.feature.wallet.components.ActivityRow
import app.getvela.wallet.feature.wallet.components.AssetRow
import app.getvela.wallet.feature.wallet.components.ChainSelectSheet
import app.getvela.wallet.feature.wallet.components.DayLabel
import app.getvela.wallet.feature.wallet.components.EmptyState
import app.getvela.wallet.feature.wallet.components.SectionHeader
import app.getvela.wallet.feature.wallet.components.SkeletonActivityRow
import app.getvela.wallet.feature.wallet.components.SkeletonAssetRow
import app.getvela.wallet.feature.wallet.components.VelaTabBar
import app.getvela.wallet.feature.wallet.components.WalletHeaderRow
import app.getvela.wallet.feature.wallet.components.BalanceDisplay

/**
 * Mobile wallet home (spec 015 FR-002): assembles the component vocabulary for
 * any of the ten H-states from a fixture model alone — no business state, no
 * fetching. H7x applies its 1.35× text scale through LocalDensity (FR-011).
 */
@Composable
fun WalletScreen(
    model: WalletHomeModel,
    modifier: Modifier = Modifier,
    onPillClick: () -> Unit = {},
    onSheetDismiss: () -> Unit = {},
) {
    if (model.textScale != 1f) {
        val density = LocalDensity.current
        CompositionLocalProvider(
            LocalDensity provides Density(density.density, density.fontScale * model.textScale),
        ) {
            WalletHomeContent(model, modifier, onPillClick)
        }
    } else {
        WalletHomeContent(model, modifier, onPillClick)
    }

    model.sheet?.let { sheet ->
        ChainSelectSheet(model = sheet, onDismiss = onSheetDismiss)
    }
}

@Composable
private fun WalletHomeContent(
    model: WalletHomeModel,
    modifier: Modifier = Modifier,
    onPillClick: () -> Unit = {},
) {
    val colors = VelaTheme.colors
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(colors.bgBase),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding(),
        ) {
            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = VelaSizing.screenPaddingX),
            ) {
                Spacer(modifier = Modifier.height(VelaSpacing.xl))
                WalletHeaderRow(
                    header = model.header,
                    pill = model.pill,
                    onPillClick = onPillClick,
                )
                Spacer(modifier = Modifier.height(VelaSpacing.xl3))
                BalanceDisplay(model = model.balance)
                Spacer(modifier = Modifier.height(VelaSpacing.xl3))
                ActionButtonRow(actions = model.actions)
                Spacer(modifier = Modifier.height(VelaSpacing.xl4))

                SectionHeader(
                    title = model.activitySection.title,
                    action = model.activitySection.action,
                )
                when (model.activitySection.mode) {
                    SectionMode.Rows -> model.activityGroups.forEach { group ->
                        DayLabel(label = group.label)
                        group.rows.forEach { row -> ActivityRow(model = row) }
                    }
                    SectionMode.Empty -> model.activitySection.empty?.let {
                        EmptyState(icon = VelaIcons.Inbox, model = it)
                    }
                    SectionMode.Loading -> {
                        Spacer(modifier = Modifier.height(VelaSpacing.md))
                        repeat(2) { SkeletonActivityRow() }
                    }
                }
                Spacer(modifier = Modifier.height(VelaSpacing.xl4))

                SectionHeader(
                    title = model.assetsSection.title,
                    action = model.assetsSection.action,
                )
                when (model.assetsSection.mode) {
                    SectionMode.Rows -> {
                        Spacer(modifier = Modifier.height(VelaSpacing.sm))
                        model.assetRows.forEach { row -> AssetRow(model = row) }
                    }
                    SectionMode.Empty -> model.assetsSection.empty?.let {
                        EmptyState(icon = VelaIcons.Wallet, model = it)
                    }
                    SectionMode.Loading -> {
                        Spacer(modifier = Modifier.height(VelaSpacing.md))
                        repeat(3) { SkeletonAssetRow() }
                    }
                }
                Spacer(modifier = Modifier.height(VelaSpacing.xl3))
            }
            VelaTabBar(
                tabs = model.tabs,
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding(),
            )
        }
    }
}
