import AuthenticationServices
import CryptoKit
import SwiftUI

/// Handles Passkey (WebAuthn) registration, authentication, and signing via ASAuthorization.
final class PasskeyService: NSObject {
    /// The relying party identifier for Passkey operations.
    /// Must match your associated domain (e.g. getvela.app).
    /// RPID = root domain, so all *.getvela.app subdomains can use this credential.
    static let relyingParty = "getvela.app"

    private var continuation: CheckedContinuation<PasskeyResult, Error>?

    enum PasskeyError: Error, LocalizedError {
        case cancelled
        case failed(String)
        case noCredential
        case noPresentationAnchor

        var errorDescription: String? {
            switch self {
            case .cancelled: "Passkey operation was cancelled."
            case .failed(let msg): "Passkey failed: \(msg)"
            case .noCredential: "No credential returned."
            case .noPresentationAnchor: "No presentation anchor available."
            }
        }
    }

    struct PasskeyResult {
        let credentialID: Data
        let publicKey: Data?        // only on registration
        let signature: Data?        // only on assertion
        let authenticatorData: Data?
        let clientDataJSON: Data?
        let userID: Data?
    }

    // MARK: - Registration (Create Passkey)

    /// Register a new Passkey credential.
    /// userID encodes the username: "username\0uuid" so it can be recovered on login.
    @MainActor
    func register(userName: String) async throws -> PasskeyResult {
        let uid = Self.encodeUserID(name: userName)

        let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: Self.relyingParty)
        let challenge = generateChallenge()
        let request = provider.createCredentialRegistrationRequest(
            challenge: challenge,
            name: userName,
            userID: uid
        )

        return try await performRequest(request)
    }

    // MARK: - Authentication (Login with Passkey)

    /// Authenticate with an existing Passkey.
    @MainActor
    func authenticate() async throws -> PasskeyResult {
        let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: Self.relyingParty)
        let challenge = generateChallenge()
        let request = provider.createCredentialAssertionRequest(challenge: challenge)

        return try await performRequest(request)
    }

    // MARK: - Sign Data

    /// Sign arbitrary data using a Passkey assertion.
    /// - Parameters:
    ///   - data: The challenge/data to sign
    ///   - credentialID: Optional credential ID to use (avoids showing picker)
    @MainActor
    func sign(data: Data, credentialID: Data? = nil) async throws -> PasskeyResult {
        let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: Self.relyingParty)
        let request = provider.createCredentialAssertionRequest(challenge: data)

        // Specify which credential to use — avoids showing passkey picker
        if let credentialID {
            request.allowedCredentials = [
                ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: credentialID)
            ]
        }

        return try await performRequest(request)
    }

    // MARK: - Private

    @MainActor
    private func performRequest(_ request: ASAuthorizationRequest) async throws -> PasskeyResult {
        return try await withCheckedThrowingContinuation { cont in
            self.continuation = cont

            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    // MARK: - UserID Encoding

    /// Encode: "username\0uuid" → Data
    static func encodeUserID(name: String) -> Data {
        let combined = "\(name)\0\(UUID().uuidString)"
        return Data(combined.utf8)
    }

    /// Decode: Data → username (everything before the first \0)
    static func decodeUserName(from userID: Data) -> String? {
        guard let str = String(data: userID, encoding: .utf8) else { return nil }
        return str.components(separatedBy: "\0").first
    }

    private func generateChallenge() -> Data {
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return Data(bytes)
    }
}

// MARK: - ASAuthorizationControllerDelegate

extension PasskeyService: ASAuthorizationControllerDelegate {
    func authorizationController(controller: ASAuthorizationController,
                                 didCompleteWithAuthorization authorization: ASAuthorization) {
        if let registration = authorization.credential as? ASAuthorizationPlatformPublicKeyCredentialRegistration {
            let result = PasskeyResult(
                credentialID: registration.credentialID,
                publicKey: registration.rawAttestationObject,
                signature: nil,
                authenticatorData: nil,
                clientDataJSON: registration.rawClientDataJSON,
                userID: nil
            )
            continuation?.resume(returning: result)
        } else if let assertion = authorization.credential as? ASAuthorizationPlatformPublicKeyCredentialAssertion {
            let result = PasskeyResult(
                credentialID: assertion.credentialID,
                publicKey: nil,
                signature: assertion.signature,
                authenticatorData: assertion.rawAuthenticatorData,
                clientDataJSON: assertion.rawClientDataJSON,
                userID: assertion.userID
            )
            continuation?.resume(returning: result)
        } else {
            continuation?.resume(throwing: PasskeyError.noCredential)
        }
        continuation = nil
    }

    func authorizationController(controller: ASAuthorizationController,
                                 didCompleteWithError error: Error) {
        if let authError = error as? ASAuthorizationError, authError.code == .canceled {
            continuation?.resume(throwing: PasskeyError.cancelled)
        } else {
            continuation?.resume(throwing: PasskeyError.failed(error.localizedDescription))
        }
        continuation = nil
    }
}

// MARK: - ASAuthorizationControllerPresentationContextProviding

extension PasskeyService: ASAuthorizationControllerPresentationContextProviding {
    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let window = scene.windows.first else {
            return ASPresentationAnchor()
        }
        return window
    }
}
