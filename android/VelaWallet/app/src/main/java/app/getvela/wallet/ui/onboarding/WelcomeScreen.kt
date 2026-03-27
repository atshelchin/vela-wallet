package app.getvela.wallet.ui.onboarding

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.getvela.wallet.R
import app.getvela.wallet.ui.components.VelaAccentButton
import app.getvela.wallet.ui.components.VelaSailLogo
import app.getvela.wallet.ui.theme.*

@Composable
fun WelcomeScreen(
    onCreateWallet: () -> Unit,
    onLogin: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(VelaColor.textPrimary)
            .systemBarsPadding(),
    ) {
        Spacer(Modifier.weight(1f))

        // Logo + Brand
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            VelaSailLogo(size = 80.dp, color = VelaColor.accent)

            Spacer(Modifier.height(32.dp))

            // "vel" white + "a" accent
            Text(
                text = buildAnnotatedString {
                    withStyle(SpanStyle(color = Color.White)) { append("vel") }
                    withStyle(SpanStyle(color = VelaColor.accent)) { append("a") }
                },
                fontSize = 56.sp,
                fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
                letterSpacing = (-2).sp,
            )

            Spacer(Modifier.height(12.dp))

            Text(
                text = stringResource(R.string.welcome_tagline),
                style = VelaTypography.body(15f),
                color = VelaColor.textSecondary,
                textAlign = TextAlign.Center,
                lineHeight = 22.sp,
            )
        }

        Spacer(Modifier.weight(1f))

        // Buttons
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 28.dp)
                .padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            VelaAccentButton(
                text = stringResource(R.string.welcome_create),
                onClick = onCreateWallet,
            )

            // Welcome secondary style: transparent with white border
            OutlinedButton(
                onClick = onLogin,
                modifier = Modifier.fillMaxWidth().height(54.dp),
                shape = VelaButtonShape,
                border = BorderStroke(1.5.dp, Color.White.copy(alpha = 0.15f)),
                colors = ButtonDefaults.outlinedButtonColors(
                    contentColor = Color.White,
                ),
            ) {
                Text(
                    text = stringResource(R.string.welcome_import),
                    style = VelaTypography.label(16f),
                )
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun WelcomeScreenPreview() {
    VelaWalletTheme {
        WelcomeScreen(onCreateWallet = {}, onLogin = {})
    }
}
