import Foundation
import CryptoKit

/// Parses WebAuthn attestation objects and signatures.
enum AttestationParser {

    /// The raw P256 public key coordinates extracted from an attestation.
    struct P256PublicKey {
        let x: Data  // 32 bytes
        let y: Data  // 32 bytes

        /// Uncompressed format: 04 || x || y
        var uncompressedHex: String {
            "04" + x.hexString + y.hexString
        }
    }

    // MARK: - Extract P256 Public Key from Attestation Object

    /// Parse the rawAttestationObject (CBOR) to extract the P256 public key.
    /// Structure: {fmt, attStmt, authData}
    /// authData: rpIdHash(32) | flags(1) | signCount(4) | attestedCredData
    /// attestedCredData: aaguid(16) | credIdLen(2) | credId(n) | coseKey(CBOR)
    /// coseKey: {1:2, 3:-7, -1:1, -2:x(32), -3:y(32)}
    static func extractPublicKey(from attestationObject: Data) -> P256PublicKey? {
        // Find authData in the CBOR map
        guard let authData = extractAuthData(from: attestationObject) else { return nil }

        // authData minimum: 32 (rpIdHash) + 1 (flags) + 4 (signCount) = 37
        guard authData.count > 37 else { return nil }

        let flags = authData[32]
        let hasAttestedCredData = (flags & 0x40) != 0
        guard hasAttestedCredData else { return nil }

        // Skip rpIdHash(32) + flags(1) + signCount(4) + aaguid(16) = 53
        guard authData.count > 55 else { return nil }
        let credIdLen = Int(authData[53]) << 8 | Int(authData[54])

        let coseKeyOffset = 55 + credIdLen
        guard authData.count > coseKeyOffset else { return nil }

        let coseKeyData = authData.suffix(from: coseKeyOffset)
        return extractP256FromCOSE(coseKeyData)
    }

    // MARK: - Convert DER Signature to Raw r||s

    /// iOS returns ECDSA signatures in DER format. The server expects raw r||s (64 bytes).
    /// DER: 30 <len> 02 <r_len> <r> 02 <s_len> <s>
    static func derSignatureToRaw(_ derSig: Data) -> Data? {
        var index = 0
        let bytes = [UInt8](derSig)

        guard bytes.count > 6, bytes[0] == 0x30 else { return nil }
        index = 2  // skip 30 <len>

        guard bytes[index] == 0x02 else { return nil }
        index += 1
        let rLen = Int(bytes[index])
        index += 1

        guard index + rLen < bytes.count else { return nil }
        var r = Data(bytes[index..<(index + rLen)])
        index += rLen

        guard index < bytes.count, bytes[index] == 0x02 else { return nil }
        index += 1
        let sLen = Int(bytes[index])
        index += 1

        guard index + sLen <= bytes.count else { return nil }
        var s = Data(bytes[index..<(index + sLen)])

        // Strip leading zero padding (DER uses signed integers)
        if r.count == 33 && r[0] == 0x00 { r = r.dropFirst() }
        if s.count == 33 && s[0] == 0x00 { s = s.dropFirst() }

        // Pad to 32 bytes if shorter
        while r.count < 32 { r.insert(0x00, at: 0) }
        while s.count < 32 { s.insert(0x00, at: 0) }

        return r + s
    }

    // MARK: - Private: Minimal CBOR Parsing

    /// Extract the authData field from a CBOR-encoded attestation object map.
    private static func extractAuthData(from cbor: Data) -> Data? {
        let bytes = [UInt8](cbor)
        var i = 0

        // Expect a CBOR map (major type 5)
        guard i < bytes.count else { return nil }
        let major = bytes[i] >> 5
        let additional = bytes[i] & 0x1F
        guard major == 5 else { return nil }
        i += 1

        let mapCount: Int
        if additional < 24 {
            mapCount = Int(additional)
        } else if additional == 24 {
            guard i < bytes.count else { return nil }
            mapCount = Int(bytes[i]); i += 1
        } else {
            return nil
        }

        // Iterate map entries looking for "authData"
        for _ in 0..<mapCount {
            guard i < bytes.count else { return nil }

            // Read key (text string)
            let keyMajor = bytes[i] >> 5
            let keyAdd = bytes[i] & 0x1F
            i += 1

            if keyMajor == 3 { // text string
                let keyLen: Int
                if keyAdd < 24 {
                    keyLen = Int(keyAdd)
                } else if keyAdd == 24 {
                    guard i < bytes.count else { return nil }
                    keyLen = Int(bytes[i]); i += 1
                } else { return nil }

                guard i + keyLen <= bytes.count else { return nil }
                let keyStr = String(bytes: bytes[i..<(i + keyLen)], encoding: .utf8) ?? ""
                i += keyLen

                if keyStr == "authData" {
                    // Read value (byte string)
                    guard i < bytes.count else { return nil }
                    let valMajor = bytes[i] >> 5
                    let valAdd = bytes[i] & 0x1F
                    i += 1

                    guard valMajor == 2 else { return nil } // byte string

                    let valLen: Int
                    if valAdd < 24 {
                        valLen = Int(valAdd)
                    } else if valAdd == 24 {
                        guard i < bytes.count else { return nil }
                        valLen = Int(bytes[i]); i += 1
                    } else if valAdd == 25 {
                        guard i + 1 < bytes.count else { return nil }
                        valLen = Int(bytes[i]) << 8 | Int(bytes[i + 1]); i += 2
                    } else { return nil }

                    guard i + valLen <= bytes.count else { return nil }
                    return Data(bytes[i..<(i + valLen)])
                } else {
                    // Skip value
                    i = skipCBORValue(bytes, at: i) ?? bytes.count
                }
            } else {
                // Skip non-string key and its value
                i = skipCBORValue(bytes, at: i - 1) ?? bytes.count
                i = skipCBORValue(bytes, at: i) ?? bytes.count
            }
        }

        return nil
    }

    /// Extract x, y coordinates from a COSE key (CBOR map).
    private static func extractP256FromCOSE(_ data: Data) -> P256PublicKey? {
        let bytes = [UInt8](data)
        var i = 0

        guard i < bytes.count else { return nil }
        let major = bytes[i] >> 5
        let additional = bytes[i] & 0x1F
        guard major == 5 else { return nil }
        i += 1

        let mapCount: Int
        if additional < 24 {
            mapCount = Int(additional)
        } else if additional == 24 {
            guard i < bytes.count else { return nil }
            mapCount = Int(bytes[i]); i += 1
        } else { return nil }

        var x: Data?
        var y: Data?

        for _ in 0..<mapCount {
            guard i < bytes.count else { return nil }

            // Read key (could be positive or negative integer)
            let keyVal = readCBORInt(bytes, at: &i)

            // Read value
            guard i < bytes.count else { return nil }

            if keyVal == -2 { // x coordinate
                x = readCBORByteString(bytes, at: &i)
            } else if keyVal == -3 { // y coordinate
                y = readCBORByteString(bytes, at: &i)
            } else {
                i = skipCBORValue(bytes, at: i) ?? bytes.count
            }
        }

        guard let xData = x, let yData = y, xData.count == 32, yData.count == 32 else { return nil }
        return P256PublicKey(x: xData, y: yData)
    }

    private static func readCBORInt(_ bytes: [UInt8], at i: inout Int) -> Int {
        guard i < bytes.count else { return 0 }
        let major = bytes[i] >> 5
        let additional = bytes[i] & 0x1F
        i += 1

        let rawVal: Int
        if additional < 24 {
            rawVal = Int(additional)
        } else if additional == 24 {
            guard i < bytes.count else { return 0 }
            rawVal = Int(bytes[i]); i += 1
        } else {
            return 0
        }

        // Major type 0 = unsigned int, type 1 = negative int (-1 - val)
        if major == 1 {
            return -1 - rawVal
        }
        return rawVal
    }

    private static func readCBORByteString(_ bytes: [UInt8], at i: inout Int) -> Data? {
        guard i < bytes.count else { return nil }
        let major = bytes[i] >> 5
        let additional = bytes[i] & 0x1F
        i += 1

        guard major == 2 else { return nil }

        let len: Int
        if additional < 24 {
            len = Int(additional)
        } else if additional == 24 {
            guard i < bytes.count else { return nil }
            len = Int(bytes[i]); i += 1
        } else if additional == 25 {
            guard i + 1 < bytes.count else { return nil }
            len = Int(bytes[i]) << 8 | Int(bytes[i + 1]); i += 2
        } else { return nil }

        guard i + len <= bytes.count else { return nil }
        let data = Data(bytes[i..<(i + len)])
        i += len
        return data
    }

    private static func skipCBORValue(_ bytes: [UInt8], at index: Int) -> Int? {
        var i = index
        guard i < bytes.count else { return nil }

        let major = bytes[i] >> 5
        let additional = bytes[i] & 0x1F
        i += 1

        let val: Int
        if additional < 24 {
            val = Int(additional)
        } else if additional == 24 {
            guard i < bytes.count else { return nil }
            val = Int(bytes[i]); i += 1
        } else if additional == 25 {
            guard i + 1 < bytes.count else { return nil }
            val = Int(bytes[i]) << 8 | Int(bytes[i + 1]); i += 2
        } else if additional == 26 {
            guard i + 3 < bytes.count else { return nil }
            val = Int(bytes[i]) << 24 | Int(bytes[i+1]) << 16 | Int(bytes[i+2]) << 8 | Int(bytes[i+3]); i += 4
        } else {
            return nil
        }

        switch major {
        case 0, 1: return i            // integer
        case 2, 3: return i + val       // byte/text string
        case 4:                          // array
            for _ in 0..<val { i = skipCBORValue(bytes, at: i) ?? bytes.count }
            return i
        case 5:                          // map
            for _ in 0..<val {
                i = skipCBORValue(bytes, at: i) ?? bytes.count
                i = skipCBORValue(bytes, at: i) ?? bytes.count
            }
            return i
        case 7: return i                // simple/float
        default: return nil
        }
    }
}
