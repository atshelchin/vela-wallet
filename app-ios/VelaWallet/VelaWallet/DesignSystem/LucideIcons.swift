//
//  LucideIcons.swift
//  VelaWallet
//
//  The lucide icon corpus (spec 015 contracts/icons.json, rev 2) as SVG
//  documents, rasterized through vela-core's `rasterizeSvgPng` so all four
//  platforms draw identical glyphs (research.md D2 revision: lucide
//  everywhere; SF Symbols retired from the wallet surfaces).
//
//  Outline glyphs are verbatim lucide v1.11 stroke defs (stroke 2, round
//  caps/joins). Nav solid variants are fills derived from the same geometry
//  (evenodd holes; the contacts back-person arcs stay stroked). Paint is
//  always white — the view layer renders the PNG as a template image and
//  tints it with `.foregroundStyle`.
//

import CoreGraphics

/// Every wallet glyph. Raw markup lives here (DesignSystem is the sanctioned
/// home for visual constants); rendering lives in `Components/Wallet/LucideIcon`.
enum LucideGlyph: String {
    case navWalletOutline, navWalletSolid
    case navContactsOutline, navContactsSolid
    case navExploreOutline, navExploreSolid
    case navSettingsOutline, navSettingsSolid
    case arrowDownLeft, arrowUpRight, scanLine
    case eyeOff, search, close, copy
    case chevronRight, chevronDown
    case link2, triangleAlert, refreshCw, check, inbox
    case walletUtility
    // Contacts utility glyphs (spec 018 contracts/icons.json — lucide v1.11.0).
    case userRoundPlus, usersRound, folderPlus
    case download, upload, pencil, trash2
    case ellipsis, qrCode, plus, chevronLeft

    /// Complete SVG document, white paint, 24×24 viewBox.
    var svg: String {
        switch self {
        case .navWalletSolid, .navContactsSolid, .navExploreSolid, .navSettingsSolid:
            return "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\">\(body)</svg>"
        default:
            return "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#FFFFFF\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\(body)</svg>"
        }
    }

    private var body: String {
        switch self {
        case .navWalletOutline:
            return ##"<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>"##
        case .navWalletSolid:
            return ##"<path fill="#FFFFFF" d="M18 3a1 1 0 0 1 1 1v3h1a1 1 0 0 1 1 1v3h-4a2 2 0 0 0 0 4h4v4a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h13z"/>"##
        case .navContactsOutline:
            return ##"<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>"##
        case .navContactsSolid:
            return ##"<path fill="#FFFFFF" d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2z"/><circle fill="#FFFFFF" cx="9" cy="7" r="4"/><path fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" d="M16 3.128a4 4 0 0 1 0 7.744"/><path fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" d="M22 21v-2a4 4 0 0 0-3-3.87"/>"##
        case .navExploreOutline:
            return ##"<circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z"/>"##
        case .navExploreSolid:
            return ##"<path fill="#FFFFFF" fill-rule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM16.24 7.76l-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z"/>"##
        case .navSettingsOutline:
            return ##"<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/>"##
        case .navSettingsSolid:
            return ##"<path fill="#FFFFFF" fill-rule="evenodd" d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>"##
        case .arrowDownLeft:
            return ##"<path d="M17 7 7 17"/><path d="M17 17H7V7"/>"##
        case .arrowUpRight:
            return ##"<path d="M7 7h10v10"/><path d="M7 17 17 7"/>"##
        case .scanLine:
            return ##"<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>"##
        case .eyeOff:
            return ##"<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>"##
        case .search:
            return ##"<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>"##
        case .close:
            return ##"<path d="M18 6 6 18"/><path d="m6 6 12 12"/>"##
        case .copy:
            return ##"<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>"##
        case .chevronRight:
            return ##"<path d="m9 18 6-6-6-6"/>"##
        case .chevronDown:
            return ##"<path d="m6 9 6 6 6-6"/>"##
        case .link2:
            return ##"<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/>"##
        case .triangleAlert:
            return ##"<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>"##
        case .refreshCw:
            return ##"<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>"##
        case .check:
            return ##"<path d="M20 6 9 17l-5-5"/>"##
        case .inbox:
            return ##"<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>"##
        case .walletUtility:
            return ##"<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>"##
        case .userRoundPlus:
            return ##"<path d="M2 21a8 8 0 0 1 13.292-6"/><circle cx="10" cy="8" r="5"/><path d="M19 16v6"/><path d="M22 19h-6"/>"##
        case .usersRound:
            return ##"<path d="M18 21a8 8 0 0 0-16 0"/><circle cx="10" cy="8" r="5"/><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3"/>"##
        case .folderPlus:
            return ##"<path d="M12 10v6"/><path d="M9 13h6"/><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>"##
        case .download:
            return ##"<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>"##
        case .upload:
            return ##"<path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>"##
        case .pencil:
            return ##"<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>"##
        case .trash2:
            return ##"<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>"##
        case .ellipsis:
            return ##"<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>"##
        case .qrCode:
            return ##"<rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/>"##
        case .plus:
            return ##"<path d="M5 12h14"/><path d="M12 5v14"/>"##
        case .chevronLeft:
            return ##"<path d="m15 18-6-6 6-6"/>"##
        }
    }
}

/// Point sizes for the wallet glyphs — mirrors the retired `WalletIconFont`
/// recipes so swapping renderers didn't move any layout.
enum LucideIconSize {
    static let tab: CGFloat = 22
    static let action: CGFloat = 20
    static let rowGlyph: CGFloat = 15
    static let nameChevron: CGFloat = 12
    static let smallChevron: CGFloat = 11
    static let statusIcon: CGFloat = 13
    static let eye: CGFloat = 17
    static let empty: CGFloat = 28
    static let sheetSearch: CGFloat = 17
    static let checkmark: CGFloat = 15
    // Contacts slots (spec 018).
    static let menuRow: CGFloat = 18
    static let groupTileGlyph: CGFloat = 20
    static let ghostPlus: CGFloat = 16
    static let chipPlus: CGFloat = 12
    static let addressCopy: CGFloat = 18
}
