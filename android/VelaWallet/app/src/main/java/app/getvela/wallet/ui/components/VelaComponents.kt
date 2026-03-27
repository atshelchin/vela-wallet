package app.getvela.wallet.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.getvela.wallet.ui.theme.*

// MARK: - Navigation Bar (matches iOS VelaNavBar)

@Composable
fun VelaNavBar(
    title: String,
    onBack: (() -> Unit)? = null,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = VelaSpacing.screenH, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (onBack != null) {
            IconButton(onClick = onBack, modifier = Modifier.size(36.dp)) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Back",
                    tint = VelaColor.textPrimary,
                )
            }
        } else {
            Spacer(Modifier.size(36.dp))
        }

        Spacer(Modifier.weight(1f))

        Text(
            text = title,
            style = VelaTypography.title(17f),
            color = VelaColor.textPrimary,
        )

        Spacer(Modifier.weight(1f))
        Spacer(Modifier.size(36.dp))
    }
}

// MARK: - Primary Button (matches iOS VelaPrimaryButtonStyle)

@Composable
fun VelaPrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    isLoading: Boolean = false,
) {
    Button(
        onClick = onClick,
        modifier = modifier.fillMaxWidth().height(54.dp),
        enabled = enabled && !isLoading,
        shape = VelaButtonShape,
        colors = ButtonDefaults.buttonColors(
            containerColor = VelaColor.textPrimary,
            contentColor = Color.White,
            disabledContainerColor = VelaColor.textPrimary.copy(alpha = 0.5f),
            disabledContentColor = Color.White.copy(alpha = 0.7f),
        ),
    ) {
        if (isLoading) {
            CircularProgressIndicator(
                modifier = Modifier.size(20.dp),
                color = Color.White,
                strokeWidth = 2.dp,
            )
        } else {
            Text(text, style = VelaTypography.label(16f))
        }
    }
}

// MARK: - Secondary Button (matches iOS VelaSecondaryButtonStyle)

@Composable
fun VelaSecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    OutlinedButton(
        onClick = onClick,
        modifier = modifier.fillMaxWidth().height(54.dp),
        enabled = enabled,
        shape = VelaButtonShape,
        border = BorderStroke(1.5.dp, VelaColor.border),
        colors = ButtonDefaults.outlinedButtonColors(
            contentColor = VelaColor.textPrimary,
        ),
    ) {
        Text(text, style = VelaTypography.label(16f))
    }
}

// MARK: - Accent Button (matches iOS VelaAccentButtonStyle)

@Composable
fun VelaAccentButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    isLoading: Boolean = false,
) {
    Button(
        onClick = onClick,
        modifier = modifier.fillMaxWidth().height(54.dp),
        enabled = enabled && !isLoading,
        shape = VelaButtonShape,
        colors = ButtonDefaults.buttonColors(
            containerColor = VelaColor.accent,
            contentColor = Color.White,
            disabledContainerColor = VelaColor.accent.copy(alpha = 0.5f),
            disabledContentColor = Color.White.copy(alpha = 0.7f),
        ),
    ) {
        if (isLoading) {
            CircularProgressIndicator(
                modifier = Modifier.size(20.dp),
                color = Color.White,
                strokeWidth = 2.dp,
            )
        } else {
            Text(text, style = VelaTypography.label(16f))
        }
    }
}

// MARK: - Sail Logo (matches iOS VelaSailLogo)

@Composable
fun VelaSailLogo(
    size: Dp = 80.dp,
    color: Color = VelaColor.accent,
) {
    Canvas(modifier = Modifier.size(size)) {
        val w = this.size.width
        val h = this.size.height

        // Sail shape
        val sail = Path().apply {
            moveTo(w * 0.475f, h * 0.15f)
            quadraticTo(w * 0.3f, h * 0.5f, w * 0.225f, h * 0.8f)
            quadraticTo(w * 0.4f, h * 0.72f, w * 0.5f, h * 0.675f)
            quadraticTo(w * 0.6f, h * 0.72f, w * 0.775f, h * 0.8f)
            quadraticTo(w * 0.7f, h * 0.5f, w * 0.525f, h * 0.15f)
            close()
        }
        drawPath(sail, color, style = Fill)

        // Mast
        drawLine(
            color = color,
            start = Offset(w * 0.5f, h * 0.675f),
            end = Offset(w * 0.5f, h * 0.9f),
            strokeWidth = 2.dp.toPx(),
        )

        // Base line
        drawLine(
            color = color.copy(alpha = 0.4f),
            start = Offset(w * 0.375f, h * 0.9f),
            end = Offset(w * 0.625f, h * 0.9f),
            strokeWidth = 1.5.dp.toPx(),
        )
    }
}

// MARK: - Network Dot

@Composable
fun NetworkDot(
    color: Color = VelaColor.green,
    size: Dp = 7.dp,
) {
    Box(
        modifier = Modifier
            .size(size)
            .background(color, CircleShape),
    )
}

// MARK: - Token Icon

@Composable
fun TokenIcon(
    label: String,
    color: Color,
    bg: Color,
    size: Dp = 42.dp,
) {
    Box(
        modifier = Modifier
            .size(size)
            .background(bg, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            style = VelaTypography.label(size.value * 0.38f),
            color = color,
        )
    }
}

// MARK: - Card Modifier

@Composable
fun VelaCard(
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = modifier
            .background(VelaColor.bgCard, VelaCardShape)
            .border(1.dp, VelaColor.border, VelaCardShape),
        content = content,
    )
}
