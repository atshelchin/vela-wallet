//
//  HybridCeremony.swift
//  VelaWallet
//
//  "Sign in with your phone" — the caBLE / hybrid transport as INITIATOR, ours
//  and not the system sheet's: it works where Apple's own cross-device flow
//  cannot (no internet, or an Android/securitykeys authenticator over the CTAP
//  2.3 BLE-only channel).
//
//  The Noise handshake and CTAP framing are the core's (vela_core::cable, the
//  same code the desktop, Android and the other phone's authenticator run).
//  This class is iOS's side of the three seams:
//
//   * the QR the OTHER phone scans (qrPayload);
//   * the transport — a BLE scan for the responder's advert, then either an
//     L2CAP CoC (CTAP 2.3, no internet) or a WebSocket tunnel (CTAP 2.2), as
//     one CableFramePort (HybridCableScanner + CableTransports); and
//   * the person (CtapCeremonyHost — randomness, and the "look at your phone"
//     touch prompt; a phone-resident passkey needs no PIN from us).
//
//  Deliberately parallel to SmartCardCtapCeremony: same shape, different route.
//

import Foundation
import CoreBluetooth
import Security
import VelaCore

final class HybridCeremony {
    private let prompts: SmartCardCtapCeremony.Prompts
    /// Show (or clear, with nil) the caBLE QR — the ViewModel renders it.
    private let showQr: @MainActor (String?) -> Void

    @MainActor private var scanner: HybridCableScanner?

    init(prompts: SmartCardCtapCeremony.Prompts, showQr: @escaping @MainActor (String?) -> Void) {
        self.prompts = prompts
        self.showQr = showQr
    }

    /// Fresh per-ceremony secrets: the QR both encodes and the handshake keys off.
    struct Session {
        let staticSeed: Data
        let qrSecret: Data
    }

    func register(
        name: String,
        excludeCredentialIds: [String]
    ) async throws -> Registration {
        try await run(forGet: false) { port, plaintext, host, session in
            try ctapRegisterCable(
                port: port,
                host: host,
                staticSeed: session.staticSeed,
                qrSecret: session.qrSecret,
                advertPlaintext: plaintext,
                product: Self.hybridProduct,
                name: name,
                excludeCredentialIds: excludeCredentialIds
            ).toRegistration()
        }
    }

    func assert(
        challenge: Data,
        credentialIdHex: String?
    ) async throws -> Assertion {
        try await run(forGet: true) { port, plaintext, host, session in
            try ctapAssertCable(
                port: port,
                host: host,
                staticSeed: session.staticSeed,
                qrSecret: session.qrSecret,
                advertPlaintext: plaintext,
                product: Self.hybridProduct,
                challenge: challenge,
                credentialIdHex: credentialIdHex ?? ""
            ).toAssertion()
        }
    }

    /// Mint fresh secrets, put the QR on screen, find the phone, open the
    /// channel its advert chose, and run [body] on a background queue (the
    /// ceremony BLOCKS — Rust drives the callbacks). The QR is cleared however
    /// it ends.
    private func run<T>(
        forGet: Bool,
        _ body: @escaping (CableConnPort, Data, CtapCeremonyHost, Session) throws -> T
    ) async throws -> T {
        // A static seed the scalar field rejects is retried with fresh
        // randomness — rare, and the payload call answers nil for it.
        var session = Self.newSession()
        var payload = Self.qrPayload(session, forGet: forGet)
        var tries = 0
        while payload == nil && tries < 4 {
            session = Self.newSession()
            payload = Self.qrPayload(session, forGet: forGet)
            tries += 1
        }
        guard let qr = payload else {
            throw PasskeyFailure(kind: .other, message: "Could not start sign in with your phone.")
        }

        let scanner = await MainActor.run { () -> HybridCableScanner in
            let s = HybridCableScanner()
            self.scanner = s
            return s
        }
        await MainActor.run { showQr(qr) }
        defer { Task { @MainActor in self.showQr(nil) } }

        print("[vela-cable] QR on screen; scanning for the phone's advert…")
        guard let hit = await scanner.findResponder(
            qrSecret: session.qrSecret,
            timeoutMs: Self.scanTimeoutMs
        ) else {
            print("[vela-cable] no advert matched within the scan window")
            throw PasskeyFailure(
                kind: .other,
                message: "No phone answered the code. Scan it with the other device and try again."
            )
        }

        // The advert chooses the channel: a PSM means the CTAP 2.3 local BLE
        // channel (no tunnel, no internet); none means the CTAP 2.2 tunnel.
        let conn: CableConn
        if let psm = hit.advert.psm {
            print("[vela-cable] advert offers BLE (PSM \(psm)) — L2CAP CoC, no tunnel")
            conn = try await scanner.openL2cap(hit, psm: psm, timeoutMs: Self.connectTimeoutMs)
        } else {
            print("[vela-cable] advert has no PSM — WebSocket tunnel")
            guard let urlString = cableConnectUrl(
                staticSeed: session.staticSeed,
                qrSecret: session.qrSecret,
                advertPlaintext: hit.advert.plaintext
            ), let url = URL(string: urlString) else {
                throw PasskeyFailure(kind: .other, message: "the phone's advertisement named an unknown tunnel")
            }
            conn = try await WebSocketCableConn.connect(url: url, timeoutMs: Self.connectTimeoutMs)
        }

        let port = await CableConnPort(conn)
        let host = CableHostBridge(prompts: prompts)
        let plaintext = hit.advert.plaintext
        defer {
            prompts.touchWaiting(kind: nil, product: "")
            port.close()
        }

        print("[vela-cable] channel up; starting the ceremony (Noise + CTAP in Rust)")
        return try await withCheckedThrowingContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                do {
                    continuation.resume(returning: try body(port, plaintext, host, session))
                } catch let error as CtapError {
                    print("[vela-cable] ceremony failed: \(error)")
                    continuation.resume(throwing: error.toPasskeyFailure())
                } catch {
                    continuation.resume(
                        throwing: PasskeyFailure(kind: .other, message: error.localizedDescription)
                    )
                }
            }
        }
    }

    private static func newSession() -> Session {
        Session(staticSeed: randomData(32), qrSecret: randomData(16))
    }

    private static func qrPayload(_ session: Session, forGet: Bool) -> String? {
        cableQrPayload(
            staticSeed: session.staticSeed,
            qrSecret: session.qrSecret,
            // Exactly Chrome's shape — no channel offer. The BLE channel is
            // chosen by the AUTHENTICATOR's advert (its PSM suffix); GMS's
            // caBLE-v2.1 parser hard-rejects any QR whose key 6 is not its
            // legacy bool (device-found 2026-08-28).
            epochSeconds: Int64(Date().timeIntervalSince1970),
            forGet: forGet
        )
    }

    private static func randomData(_ count: Int) -> Data {
        var bytes = [UInt8](repeating: 0, count: count)
        _ = SecRandomCopyBytes(kSecRandomDefault, count, &bytes)
        return Data(bytes)
    }

    /// The person picks up the other phone, unlocks it, approves the prompt.
    private static let scanTimeoutMs = 90_000
    private static let connectTimeoutMs = 15_000
    /// What the touch prompt names while the OTHER phone shows its sheet.
    private static let hybridProduct = "your phone"
}

/// The CtapCeremonyHost for a phone-resident credential: no PIN, no picker
/// (the phone runs its own), just randomness and the "look at your phone"
/// prompt.
private final class CableHostBridge: CtapCeremonyHost, @unchecked Sendable {
    private let prompts: SmartCardCtapCeremony.Prompts

    init(prompts: SmartCardCtapCeremony.Prompts) {
        self.prompts = prompts
    }

    func pin(request: CtapPinRequest) -> String? { nil }

    func pick(choices: [CtapCredentialChoice]) -> UInt32? { 0 }

    func random(len: UInt32) -> Data {
        var bytes = [UInt8](repeating: 0, count: Int(len))
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return Data(bytes)
    }

    func note(line: String) {
        print("[vela-wallet] cable.ctap: \(line)")
    }

    func touch(kind: String, product: String) {
        prompts.touchWaiting(kind: kind, product: product)
    }
}
