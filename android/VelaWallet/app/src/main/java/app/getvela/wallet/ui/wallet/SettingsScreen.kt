package app.getvela.wallet.ui.wallet

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.getvela.wallet.R
import app.getvela.wallet.model.WalletState
import app.getvela.wallet.ui.components.VelaNavBar
import app.getvela.wallet.ui.theme.VelaColor
import app.getvela.wallet.ui.theme.VelaTypography

@Composable
fun SettingsScreen(
    wallet: WalletState,
    onLogout: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(VelaColor.bg)
            .systemBarsPadding(),
    ) {
        VelaNavBar(title = stringResource(R.string.tab_settings))

        Spacer(Modifier.height(24.dp))

        // Account info
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = VelaSpacing.screenH),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = wallet.activeAccount?.name ?: "Wallet",
                style = VelaTypography.heading(20f),
                color = VelaColor.textPrimary,
            )

            Spacer(Modifier.height(4.dp))

            Text(
                text = wallet.shortAddress,
                style = VelaTypography.mono(13f),
                color = VelaColor.textTertiary,
            )
        }

        Spacer(Modifier.weight(1f))

        // TODO: Account switcher, network settings, language, logout
    }
}

private val VelaSpacing = app.getvela.wallet.ui.theme.VelaSpacing
