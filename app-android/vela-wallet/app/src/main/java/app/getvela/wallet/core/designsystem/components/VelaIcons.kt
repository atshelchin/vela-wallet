package app.getvela.wallet.core.designsystem.components

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

/**
 * Hand-built icon corpus (24×24 viewport) from specs/015-wallet-home-ui/contracts/icons.json.
 *
 * Every glyph is Lucide v1.11.0 (contract rev 2): stroke icons carry stroke 2 =
 * icon.stroke.base with round caps/joins and no fill; nav solid variants are
 * fills derived from the same lucide geometry (evenodd holes; the contacts
 * back-person arcs stay stroked), so selection swaps style without layout
 * shift (spec FR-007).
 *
 * Paths carry currentColor black; tint at the call site via Icon(tint = …).
 */
object VelaIcons {

    private fun strokeIcon(name: String, vararg paths: String): ImageVector =
        ImageVector.Builder(
            name = name,
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f,
        ).apply {
            for (d in paths) {
                addPath(
                    pathData = addPathNodes(d),
                    fill = null,
                    stroke = SolidColor(Color.Black),
                    strokeLineWidth = 2f,
                    strokeLineCap = StrokeCap.Round,
                    strokeLineJoin = StrokeJoin.Round,
                )
            }
        }.build()

    private fun evenOddFillIcon(name: String, vararg paths: String): ImageVector =
        ImageVector.Builder(
            name = name,
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f,
        ).apply {
            for (d in paths) {
                addPath(
                    pathData = addPathNodes(d),
                    fill = SolidColor(Color.Black),
                    pathFillType = PathFillType.EvenOdd,
                )
            }
        }.build()

    private fun fillIcon(name: String, vararg paths: String): ImageVector =
        ImageVector.Builder(
            name = name,
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f,
        ).apply {
            for (d in paths) {
                addPath(
                    pathData = addPathNodes(d),
                    fill = SolidColor(Color.Black),
                )
            }
        }.build()

    /** lucide arrow-left (spec 009 placeholder screens). */
    val ArrowLeft: ImageVector by lazy {
        strokeIcon("VelaArrowLeft", "M19 12L5 12", "M12 19L5 12L12 5")
    }

    // --- Nav (lucide; stroke outline unselected / derived solid selected) ------

    val NavWalletOutline: ImageVector by lazy {
        strokeIcon(
            "VelaNavWalletOutline",
            "M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1",
            "M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4",
        )
    }

    val NavWalletSolid: ImageVector by lazy {
        fillIcon(
            "VelaNavWalletSolid",
            "M18 3a1 1 0 0 1 1 1v3h1a1 1 0 0 1 1 1v3h-4a2 2 0 0 0 0 4h4v4a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h13z",
        )
    }

    val NavContactsOutline: ImageVector by lazy {
        strokeIcon(
            "VelaNavContactsOutline",
            "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
            "M16 3.128a4 4 0 0 1 0 7.744",
            "M22 21v-2a4 4 0 0 0-3-3.87",
            "M13 7a4 4 0 1 1-8 0a4 4 0 1 1 8 0",
        )
    }

    /** Mixed per the contract: filled body + head, the back-person arcs stay stroked. */
    val NavContactsSolid: ImageVector by lazy {
        ImageVector.Builder(
            name = "VelaNavContactsSolid",
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f,
        ).apply {
            addPath(
                pathData = addPathNodes("M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2z"),
                fill = SolidColor(Color.Black),
            )
            addPath(
                pathData = addPathNodes("M13 7a4 4 0 1 1-8 0a4 4 0 1 1 8 0"),
                fill = SolidColor(Color.Black),
            )
            for (d in arrayOf("M16 3.128a4 4 0 0 1 0 7.744", "M22 21v-2a4 4 0 0 0-3-3.87")) {
                addPath(
                    pathData = addPathNodes(d),
                    fill = null,
                    stroke = SolidColor(Color.Black),
                    strokeLineWidth = 2f,
                    strokeLineCap = StrokeCap.Round,
                    strokeLineJoin = StrokeJoin.Round,
                )
            }
        }.build()
    }

    val NavExploreOutline: ImageVector by lazy {
        strokeIcon(
            "VelaNavExploreOutline",
            "M22 12a10 10 0 1 1-20 0a10 10 0 1 1 20 0",
            "m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z",
        )
    }

    val NavExploreSolid: ImageVector by lazy {
        evenOddFillIcon(
            "VelaNavExploreSolid",
            "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM16.24 7.76l-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z",
        )
    }

    val NavSettingsOutline: ImageVector by lazy {
        strokeIcon(
            "VelaNavSettingsOutline",
            "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915",
            "M15 12a3 3 0 1 1-6 0a3 3 0 1 1 6 0",
        )
    }

    val NavSettingsSolid: ImageVector by lazy {
        evenOddFillIcon(
            "VelaNavSettingsSolid",
            "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
        )
    }

    // --- Utility (stroke style, Lucide) -----------------------------------------

    val ArrowDownLeft: ImageVector by lazy {
        strokeIcon("VelaArrowDownLeft", "M17 7 7 17", "M17 17H7V7")
    }

    val ArrowUpRight: ImageVector by lazy {
        strokeIcon("VelaArrowUpRight", "M7 7h10v10", "M7 17 17 7")
    }

    val ScanLine: ImageVector by lazy {
        strokeIcon(
            "VelaScanLine",
            "M3 7V5a2 2 0 0 1 2-2h2",
            "M17 3h2a2 2 0 0 1 2 2v2",
            "M21 17v2a2 2 0 0 1-2 2h-2",
            "M7 21H5a2 2 0 0 1-2-2v-2",
            "M7 12h10",
        )
    }

    val Eye: ImageVector by lazy {
        strokeIcon(
            "VelaEye",
            "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0",
            // circle cx=12 cy=12 r=3
            "M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0",
        )
    }

    val EyeOff: ImageVector by lazy {
        strokeIcon(
            "VelaEyeOff",
            "M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49",
            "M14.084 14.158a3 3 0 0 1-4.242-4.242",
            "M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143",
            "m2 2 20 20",
        )
    }

    val Search: ImageVector by lazy {
        strokeIcon(
            "VelaSearch",
            "m21 21-4.34-4.34",
            // circle cx=11 cy=11 r=8
            "M3 11a8 8 0 1 0 16 0a8 8 0 1 0-16 0",
        )
    }

    val Close: ImageVector by lazy {
        strokeIcon("VelaClose", "M18 6 6 18", "m6 6 12 12")
    }

    val Copy: ImageVector by lazy {
        strokeIcon(
            "VelaCopy",
            // rect x=8 y=8 w=14 h=14 rx=2
            "M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z",
            "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",
        )
    }

    val ChevronRight: ImageVector by lazy {
        strokeIcon("VelaChevronRight", "m9 18 6-6-6-6")
    }

    val ChevronDown: ImageVector by lazy {
        strokeIcon("VelaChevronDown", "m6 9 6 6 6-6")
    }

    val TriangleAlert: ImageVector by lazy {
        strokeIcon(
            "VelaTriangleAlert",
            "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",
            "M12 9v4",
            "M12 17h.01",
        )
    }

    val RefreshCw: ImageVector by lazy {
        strokeIcon(
            "VelaRefreshCw",
            "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",
            "M21 3v5h-5",
            "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",
            "M8 16H3v5",
        )
    }

    val Check: ImageVector by lazy {
        strokeIcon("VelaCheck", "M20 6 9 17l-5-5")
    }

    val Inbox: ImageVector by lazy {
        strokeIcon(
            "VelaInbox",
            // polyline 22 12 16 12 14 15 10 15 8 12 2 12
            "M22 12L16 12L14 15L10 15L8 12L2 12",
            "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
        )
    }

    val Wallet: ImageVector by lazy {
        strokeIcon(
            "VelaWallet",
            "M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1",
            "M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4",
        )
    }

    val Link2: ImageVector by lazy {
        strokeIcon(
            "VelaLink2",
            "M9 17H7A5 5 0 0 1 7 7h2",
            "M15 7h2a5 5 0 1 1 0 10h-2",
            // line x1=8 y1=12 x2=16 y2=12
            "M8 12L16 12",
        )
    }
}
