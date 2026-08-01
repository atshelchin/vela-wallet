package app.getvela.wallet.core.designsystem.tokens

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** core.space — 4dp base grid; never invent intermediate gaps. */
object VelaSpacing {
    val none: Dp = 0.dp
    val xs: Dp = 2.dp
    val sm: Dp = 4.dp
    val md: Dp = 8.dp
    val lg: Dp = 12.dp
    val xl: Dp = 16.dp
    val xl2: Dp = 20.dp
    val xl3: Dp = 24.dp
    val xl4: Dp = 32.dp
    val xl5: Dp = 48.dp
}

/** core.radius. */
object VelaRadius {
    val none: Dp = 0.dp
    val sm: Dp = 4.dp
    val md: Dp = 8.dp
    val lg: Dp = 12.dp
    val xl: Dp = 16.dp
    val xl2: Dp = 20.dp

    /** radius.full = 9999 — pill/capsule. */
    val full: Dp = 9999.dp
}

/** core.border widths. */
object VelaBorder {
    val hairline: Dp = 1.dp
    val emphasis: Dp = 1.5.dp
}

/** core.size + core.layout (phone-relevant subset) + control heights. */
object VelaSizing {
    val hitTarget: Dp = 44.dp
    val hitSlop: Dp = 8.dp
    val emptyStateCircle: Dp = 56.dp
    val screenPaddingX: Dp = 24.dp
    val scanFabSize: Dp = 56.dp

    // sizing.control.* comes from the design-system brief (not present in the DTCG
    // export — do not add to the drift test until the export grows it).
    val controlSm: Dp = 36.dp
    val controlMd: Dp = 44.dp
    val controlLg: Dp = 52.dp
}

/** core.icon sizes. */
object VelaIconSize {
    val xs: Dp = 12.dp
    val sm: Dp = 14.dp
    val base: Dp = 16.dp
    val md: Dp = 18.dp
    val lg: Dp = 20.dp
    val xl: Dp = 26.dp
    val xl2: Dp = 30.dp
    val xl3: Dp = 36.dp
}

/** core.opacity. */
object VelaOpacity {
    const val disabled: Float = 0.45f
    const val dim: Float = 0.4f
    const val backdrop: Float = 0.35f
}
