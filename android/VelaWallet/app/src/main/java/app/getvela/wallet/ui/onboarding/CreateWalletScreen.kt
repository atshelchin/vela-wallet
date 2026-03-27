package app.getvela.wallet.ui.onboarding

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Fingerprint
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.getvela.wallet.R
import app.getvela.wallet.ui.components.VelaAccentButton
import app.getvela.wallet.ui.components.VelaNavBar
import app.getvela.wallet.ui.components.VelaPrimaryButton
import app.getvela.wallet.ui.components.VelaSecondaryButton
import app.getvela.wallet.ui.theme.*

@Composable
fun CreateWalletScreen(
    onBack: () -> Unit,
    onCreated: (address: String, name: String) -> Unit,
) {
    var accountName by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var uploadFailed by remember { mutableStateOf(false) }
    val focusRequester = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(VelaColor.bg)
            .systemBarsPadding(),
    ) {
        VelaNavBar(title = "", onBack = onBack)

        Spacer(Modifier.weight(1f))

        // Content
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 36.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // Icon
            Box(
                modifier = Modifier
                    .size(88.dp)
                    .background(VelaColor.bgWarm, RoundedCornerShape(28.dp))
                    .border(1.dp, VelaColor.border, RoundedCornerShape(28.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = if (uploadFailed) Icons.Default.Refresh else Icons.Default.Fingerprint,
                    contentDescription = null,
                    modifier = Modifier.size(36.dp),
                    tint = VelaColor.accent,
                )
            }

            Spacer(Modifier.height(28.dp))

            if (uploadFailed) {
                // Upload failed state
                Text(
                    text = stringResource(R.string.create_upload_failed_title),
                    style = VelaTypography.heading(24f),
                    color = VelaColor.textPrimary,
                )
                Spacer(Modifier.height(12.dp))
                Text(
                    text = stringResource(R.string.create_upload_failed_desc),
                    style = VelaTypography.body(15f),
                    color = VelaColor.textSecondary,
                    textAlign = TextAlign.Center,
                    lineHeight = 22.sp,
                )
            } else {
                // Normal create state
                Text(
                    text = stringResource(R.string.create_title),
                    style = VelaTypography.heading(28f),
                    color = VelaColor.textPrimary,
                )
                Spacer(Modifier.height(12.dp))
                Text(
                    text = stringResource(R.string.create_description),
                    style = VelaTypography.body(15f),
                    color = VelaColor.textSecondary,
                    textAlign = TextAlign.Center,
                    lineHeight = 22.sp,
                )

                Spacer(Modifier.height(28.dp))

                // Name input
                Column(modifier = Modifier.fillMaxWidth()) {
                    Text(
                        text = stringResource(R.string.create_name_label),
                        style = VelaTypography.caption().copy(
                            letterSpacing = 1.sp,
                        ),
                        color = VelaColor.textTertiary,
                        modifier = Modifier.padding(start = 4.dp, bottom = 8.dp),
                    )

                    OutlinedTextField(
                        value = accountName,
                        onValueChange = { accountName = it },
                        placeholder = {
                            Text(
                                stringResource(R.string.create_name_placeholder),
                                color = VelaColor.textTertiary,
                            )
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .focusRequester(focusRequester),
                        shape = VelaCardShape,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = VelaColor.border,
                            unfocusedBorderColor = VelaColor.border,
                            focusedContainerColor = VelaColor.bgCard,
                            unfocusedContainerColor = VelaColor.bgCard,
                            cursorColor = VelaColor.textPrimary,
                        ),
                        singleLine = true,
                    )
                }

                Spacer(Modifier.height(16.dp))

                // Security note
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(VelaColor.greenSoft, RoundedCornerShape(VelaRadius.cardSmall))
                        .padding(horizontal = 16.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Icon(
                        imageVector = Icons.Default.Shield,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                        tint = VelaColor.green,
                    )
                    Text(
                        text = stringResource(R.string.create_security_note),
                        style = VelaTypography.label(13f),
                        color = VelaColor.green,
                    )
                }
            }

            // Error message
            errorMessage?.let { error ->
                Spacer(Modifier.height(12.dp))
                Text(
                    text = error,
                    style = VelaTypography.body(13f),
                    color = VelaColor.accent,
                    textAlign = TextAlign.Center,
                )
            }
        }

        Spacer(Modifier.weight(1f))

        // Bottom buttons
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 28.dp)
                .padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (uploadFailed) {
                VelaPrimaryButton(
                    text = stringResource(R.string.create_retry_upload),
                    onClick = { /* TODO: retry upload */ },
                    isLoading = isLoading,
                    enabled = !isLoading,
                )
                VelaSecondaryButton(
                    text = stringResource(R.string.create_skip),
                    onClick = { /* TODO: skip and continue */ },
                    enabled = !isLoading,
                )
            } else {
                VelaPrimaryButton(
                    text = stringResource(R.string.create_button),
                    onClick = {
                        // TODO: Passkey creation via CredentialManager
                        isLoading = true
                    },
                    isLoading = isLoading,
                    enabled = accountName.isNotBlank(),
                )
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun CreateWalletScreenPreview() {
    VelaWalletTheme {
        CreateWalletScreen(onBack = {}, onCreated = { _, _ -> })
    }
}
