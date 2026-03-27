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
import app.getvela.wallet.ui.theme.VelaColor
import app.getvela.wallet.ui.theme.VelaTypography

@Composable
fun ConnectScreen(wallet: WalletState) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(VelaColor.bg)
            .systemBarsPadding(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = stringResource(R.string.tab_dapps),
            style = VelaTypography.heading(20f),
            color = VelaColor.textPrimary,
        )

        Spacer(Modifier.height(8.dp))

        Text(
            text = "BLE connection coming soon",
            style = VelaTypography.body(15f),
            color = VelaColor.textSecondary,
        )

        // TODO: BLE peripheral, dApp request approval
    }
}
