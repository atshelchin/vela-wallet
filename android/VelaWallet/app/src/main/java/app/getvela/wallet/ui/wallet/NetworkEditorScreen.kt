package app.getvela.wallet.ui.wallet

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.getvela.wallet.R
import app.getvela.wallet.model.Network
import app.getvela.wallet.ui.components.VelaNavBar
import app.getvela.wallet.ui.theme.*

@Composable
fun NetworkEditorScreen(onBack: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(VelaColor.bg)
            .systemBarsPadding()
            .verticalScroll(rememberScrollState()),
    ) {
        VelaNavBar(title = stringResource(R.string.settings_networks), onBack = onBack)

        Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
            Network.defaults.forEach { network ->
                NetworkConfigCard(network)
                Spacer(Modifier.height(12.dp))
            }
        }

        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun NetworkConfigCard(network: Network) {
    // Load saved config or fall back to defaults
    val savedConfig = remember { app.getvela.wallet.service.LocalStorage.shared.getNetworkConfig(network.chainId) }
    var isExpanded by remember { mutableStateOf(false) }
    var rpcUrl by remember { mutableStateOf(savedConfig?.rpcURL ?: network.rpcURL) }
    var explorerUrl by remember { mutableStateOf(savedConfig?.explorerURL ?: network.explorerURL) }
    var bundlerUrl by remember { mutableStateOf(savedConfig?.bundlerURL ?: network.bundlerURL) }

    // Auto-save when values change
    fun saveConfig() {
        app.getvela.wallet.service.LocalStorage.shared.saveNetworkConfig(
            app.getvela.wallet.service.LocalStorage.NetworkConfig(
                chainId = network.chainId,
                rpcURL = rpcUrl,
                explorerURL = explorerUrl,
                bundlerURL = bundlerUrl,
            )
        )
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(VelaRadius.card))
            .background(VelaColor.bgCard)
            .border(1.dp, VelaColor.border, RoundedCornerShape(VelaRadius.card)),
    ) {
        // Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { isExpanded = !isExpanded }
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .background(network.iconBg, RoundedCornerShape(10.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Text(network.iconLabel, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = network.iconColor)
            }

            Spacer(Modifier.width(12.dp))

            Column(Modifier.weight(1f)) {
                Text(network.displayName, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = VelaColor.textPrimary)
                Text("Chain ${network.chainId}", fontSize = 12.sp, color = VelaColor.textTertiary)
            }

            Icon(
                Icons.Default.ChevronRight, null, Modifier.size(12.dp).rotate(if (isExpanded) 90f else 0f),
                tint = VelaColor.textTertiary,
            )
        }

        // Expanded config fields
        AnimatedVisibility(visible = isExpanded) {
            Column {
                HorizontalDivider(color = VelaColor.border)
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    ConfigField("RPC URL", rpcUrl) { rpcUrl = it; saveConfig() }
                    ConfigField("Explorer", explorerUrl) { explorerUrl = it; saveConfig() }
                    ConfigField("Bundler", bundlerUrl) { bundlerUrl = it; saveConfig() }
                }
            }
        }
    }
}

@Composable
private fun ConfigField(label: String, value: String, onChange: (String) -> Unit) {
    Column {
        Text(
            label,
            style = VelaTypography.caption().copy(letterSpacing = 1.sp),
            color = VelaColor.textTertiary,
            modifier = Modifier.padding(bottom = 6.dp),
        )
        OutlinedTextField(
            value = value,
            onValueChange = onChange,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(VelaRadius.cardSmall),
            textStyle = VelaTypography.mono(12f),
            singleLine = true,
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = VelaColor.border,
                unfocusedBorderColor = VelaColor.border,
                focusedContainerColor = VelaColor.bgWarm,
                unfocusedContainerColor = VelaColor.bgWarm,
            ),
        )
    }
}
