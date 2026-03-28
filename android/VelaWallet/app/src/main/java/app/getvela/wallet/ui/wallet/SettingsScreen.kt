package app.getvela.wallet.ui.wallet

import android.app.LocaleManager
import android.content.Context
import android.os.Build
import android.os.LocaleList
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.getvela.wallet.R
import app.getvela.wallet.model.WalletState
import app.getvela.wallet.ui.components.VelaNavBar
import app.getvela.wallet.ui.theme.*
import java.util.Locale

@Composable
fun SettingsScreen(
    wallet: WalletState,
    onLogout: () -> Unit,
    onAccountSwitcher: () -> Unit = {},
    onNetworkEditor: () -> Unit = {},
) {
    var showLanguagePicker by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(VelaColor.bg)
            .systemBarsPadding()
            .verticalScroll(rememberScrollState()),
    ) {
        VelaNavBar(title = stringResource(R.string.settings_title))

        Spacer(Modifier.height(8.dp))

        // Account section
        SettingsSection(title = stringResource(R.string.settings_account)) {
            SettingsRow(
                icon = Icons.Default.AccountCircle,
                iconBg = VelaColor.accentSoft,
                iconTint = VelaColor.accent,
                title = wallet.activeAccount?.name ?: "No Wallet",
                subtitle = wallet.shortAddress.ifEmpty { stringResource(R.string.settings_switch_account) },
                onClick = onAccountSwitcher,
            )
        }

        Spacer(Modifier.height(24.dp))

        // Networks section
        SettingsSection(title = stringResource(R.string.settings_networks_section)) {
            SettingsRow(
                icon = Icons.Default.Language,
                iconBg = VelaColor.blueSoft,
                iconTint = VelaColor.blue,
                title = stringResource(R.string.settings_networks),
                subtitle = stringResource(R.string.settings_networks_rpc_desc),
                onClick = onNetworkEditor,
            )
        }

        Spacer(Modifier.height(24.dp))

        // General section
        SettingsSection(title = stringResource(R.string.settings_general)) {
            SettingsRow(
                icon = Icons.Default.Translate,
                iconBg = VelaColor.greenSoft,
                iconTint = VelaColor.green,
                title = stringResource(R.string.settings_language),
                subtitle = getCurrentLanguageDisplayName(),
                onClick = { showLanguagePicker = true },
            )
            SettingsRow(
                icon = Icons.Default.Info,
                iconBg = VelaColor.bgWarm,
                iconTint = VelaColor.textSecondary,
                title = stringResource(R.string.settings_about),
                subtitle = stringResource(R.string.settings_version),
                onClick = { },
                showDivider = false,
            )
        }

        Spacer(Modifier.height(24.dp))

        // Logout
        Row(
            modifier = Modifier
                .padding(horizontal = 16.dp)
                .fillMaxWidth()
                .clip(RoundedCornerShape(VelaRadius.card))
                .background(VelaColor.bgCard)
                .border(1.dp, VelaColor.border, RoundedCornerShape(VelaRadius.card))
                .clickable(onClick = onLogout)
                .padding(horizontal = 18.dp, vertical = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center,
        ) {
            Icon(Icons.AutoMirrored.Filled.Logout, null, Modifier.size(18.dp), tint = VelaColor.accent)
            Spacer(Modifier.width(8.dp))
            Text(stringResource(R.string.settings_logout), style = VelaTypography.label(15f), color = VelaColor.accent)
        }

        Spacer(Modifier.height(32.dp))
    }

    // Language picker dialog
    if (showLanguagePicker) {
        val ctx = LocalContext.current
        LanguagePickerDialog(
            onDismiss = { showLanguagePicker = false },
            onSelect = { langCode ->
                showLanguagePicker = false
                setAppLanguage(ctx, langCode)
            },
        )
    }
}

// MARK: - Language Picker Dialog

@Composable
private fun LanguagePickerDialog(
    onDismiss: () -> Unit,
    onSelect: (String) -> Unit,
) {
    val currentLang = if (Locale.getDefault().language == "zh") "zh" else "en"

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.settings_language), style = VelaTypography.title(17f)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(
                    Triple("en", "English", "\uD83C\uDDFA\uD83C\uDDF8"),
                    Triple("zh", "中文", "\uD83C\uDDE8\uD83C\uDDF3"),
                ).forEach { (code, name, flag) ->
                    val isSelected = currentLang == code || (code == "en" && currentLang.isEmpty())
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(VelaRadius.card))
                            .background(if (isSelected) VelaColor.accentSoft else VelaColor.bgCard)
                            .border(
                                if (isSelected) 1.5.dp else 1.dp,
                                if (isSelected) VelaColor.accent else VelaColor.border,
                                RoundedCornerShape(VelaRadius.card),
                            )
                            .clickable { onSelect(code) }
                            .padding(horizontal = 20.dp, vertical = 16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(flag, fontSize = 24.sp)
                        Spacer(Modifier.width(14.dp))
                        Text(name, fontSize = 16.sp, fontWeight = FontWeight.Medium, color = VelaColor.textPrimary)
                        Spacer(Modifier.weight(1f))
                        if (isSelected) {
                            Icon(Icons.Default.CheckCircle, null, Modifier.size(20.dp), tint = VelaColor.accent)
                        }
                    }
                }
            }
        },
        confirmButton = {},
        containerColor = VelaColor.bg,
    )
}

@Composable
private fun getCurrentLanguageDisplayName(): String {
    val context = LocalContext.current
    return try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val localeManager = context.getSystemService(LocaleManager::class.java)
            val appLocales = localeManager.applicationLocales
            if (!appLocales.isEmpty) {
                val tag = appLocales[0]?.toLanguageTag() ?: ""
                if (tag.startsWith("zh")) "中文" else "English"
            } else {
                if (Locale.getDefault().language == "zh") "中文" else "English"
            }
        } else {
            if (Locale.getDefault().language == "zh") "中文" else "English"
        }
    } catch (_: Exception) {
        "English"
    }
}

private fun setAppLanguage(context: Context, langCode: String) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        // Android 13+: system handles Activity recreation automatically
        val localeManager = context.getSystemService(LocaleManager::class.java)
        val tag = if (langCode == "zh") "zh-Hans" else "en"
        localeManager.applicationLocales = LocaleList.forLanguageTags(tag)
    } else {
        // Android 12: update locale and recreate Activity to refresh UI
        val locale = if (langCode == "zh") Locale.SIMPLIFIED_CHINESE else Locale.ENGLISH
        Locale.setDefault(locale)
        val config = context.resources.configuration
        config.setLocale(locale)
        @Suppress("DEPRECATION")
        context.resources.updateConfiguration(config, context.resources.displayMetrics)
        // Recreate to apply — seamless, no app exit
        (context as? android.app.Activity)?.recreate()
    }
}

// MARK: - Settings Section

@Composable
private fun SettingsSection(
    title: String,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column {
        Text(
            text = title,
            style = VelaTypography.caption().copy(letterSpacing = 1.5.sp),
            color = VelaColor.textTertiary,
            modifier = Modifier.padding(horizontal = 30.dp, vertical = 8.dp),
        )
        Column(
            modifier = Modifier
                .padding(horizontal = 16.dp)
                .clip(RoundedCornerShape(VelaRadius.card))
                .background(VelaColor.bgCard)
                .border(1.dp, VelaColor.border, RoundedCornerShape(VelaRadius.card)),
            content = content,
        )
    }
}

// MARK: - Settings Row

@Composable
private fun SettingsRow(
    icon: ImageVector,
    iconBg: Color,
    iconTint: Color,
    title: String,
    subtitle: String? = null,
    showDivider: Boolean = true,
    onClick: () -> Unit,
) {
    Column {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(onClick = onClick)
                .padding(horizontal = 18.dp, vertical = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(34.dp)
                    .background(iconBg, RoundedCornerShape(10.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(icon, null, Modifier.size(15.dp), tint = iconTint)
            }

            Spacer(Modifier.width(14.dp))

            Column(Modifier.weight(1f)) {
                Text(title, fontSize = 15.sp, fontWeight = FontWeight.Medium, color = VelaColor.textPrimary)
                subtitle?.let {
                    Text(it, fontSize = 12.sp, color = VelaColor.textTertiary)
                }
            }

            Icon(Icons.Default.ChevronRight, null, Modifier.size(13.dp), tint = VelaColor.textTertiary)
        }

        if (showDivider) {
            HorizontalDivider(
                color = VelaColor.border,
                thickness = 1.dp,
                modifier = Modifier.padding(start = 66.dp),
            )
        }
    }
}
