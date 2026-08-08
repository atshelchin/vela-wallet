//
//  FlowFixturesTests.swift
//  VelaWalletTests
//
//  Spec 014 T030: the fixture set is exactly the 34 contract codes
//  (contract §1; E10 renders once, listed in both gallery groups), every
//  OutcomeKind's action stack keeps the 1-primary + ≤2-secondary shape
//  (data-model §3), and the badge-variant mapping matches the data-model
//  §3 table on a spot set.
//

import Testing
@testable import VelaWallet

@MainActor
struct FlowFixturesTests {
    /// Contract §1: fixture ids are the design codes verbatim — 34 unique.
    private static let contractCodes: Set<String> = [
        "A1", "A2", "A3",
        "A4", "A4c", "A5", "A5c", "A6", "A6c", "A7", "A7c", "A8", "A8c",
        "A11", "A12", "A13",
        "E1", "E2", "E2x", "E3", "E4", "E5", "E6", "E7", "E8", "E9", "E10",
        "B1", "B1c", "B2", "B3", "B4", "B5", "B6",
    ]

    @Test func fixtureSetIsExactlyThe34ContractCodes() {
        let codes = FlowFixtures.all.map(\.code)
        #expect(codes.count == 34)
        #expect(Set(codes) == Self.contractCodes)
    }

    /// The shared E10 must be selectable from both flow groups (spec counts
    /// 35 mock files over 34 unique codes).
    @Test func e10IsReachableFromBothGalleryGroups() {
        #expect(FlowFixtures.createGroup.contains { $0.code == "E10" })
        #expect(FlowFixtures.loginGroup.contains { $0.code == "E10" })
    }

    /// Data-model §3: exactly 1 primary + 0…2 secondary, primary on top.
    @Test func everyOutcomeKindKeepsTheActionStackShape() {
        for kind in OutcomeKind.allCases {
            let actions = kind.spec.actions
            let primaries = actions.filter { $0.role == .primary }
            let secondaries = actions.filter { $0.role == .secondary }
            #expect(primaries.count == 1, "\(kind.rawValue) must have exactly one primary action")
            #expect(secondaries.count <= 2, "\(kind.rawValue) must have at most two secondary actions")
            #expect(actions.first?.role == .primary, "\(kind.rawValue) primary must lead the stack")
        }
    }

    /// Data-model §3 badge table, spot set per task T030.
    @Test func badgeVariantsMatchTheDataModelSpotSet() {
        #expect(OutcomeKind.created.spec.badge == .success) // A11
        #expect(OutcomeKind.timeout.spec.badge == .timeout) // E3
        #expect(OutcomeKind.recoverOffer.spec.badge == .info) // B2
        #expect(OutcomeKind.cancelledSetup.spec.badge == .neutral) // E4
        #expect(OutcomeKind.syncFailed.spec.badge == .warning) // A12
        #expect(OutcomeKind.network.spec.badge == .error) // E1
    }
}
