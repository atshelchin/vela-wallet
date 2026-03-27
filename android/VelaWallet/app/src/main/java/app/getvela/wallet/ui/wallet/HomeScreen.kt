package app.getvela.wallet.ui.wallet

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.getvela.wallet.model.WalletState
import app.getvela.wallet.ui.theme.VelaColor
import app.getvela.wallet.ui.theme.VelaTypography

@Composable
fun HomeScreen(wallet: WalletState) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(VelaColor.bg)
            .systemBarsPadding(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(24.dp))

        Text(
            text = wallet.activeAccount?.name ?: "Wallet",
            style = VelaTypography.title(17f),
            color = VelaColor.textPrimary,
        )

        Spacer(Modifier.height(4.dp))

        Text(
            text = wallet.shortAddress,
            style = VelaTypography.mono(13f),
            color = VelaColor.textTertiary,
        )

        Spacer(Modifier.height(32.dp))

        Text(
            text = "$0.00",
            style = VelaTypography.heading(36f),
            color = VelaColor.textPrimary,
        )

        Spacer(Modifier.weight(1f))

        // TODO: Token list, NFT grid, action buttons
    }
}
