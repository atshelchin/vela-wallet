import Foundation
import CryptoKit

// MARK: - Keccak-256 (SHA-3 variant used by Ethereum)

enum EthCrypto {

    /// Keccak-256 hash (NOT standard SHA-3, uses different padding).
    static func keccak256(_ data: Data) -> Data {
        var state = [UInt64](repeating: 0, count: 25)
        let rate = 136 // (1600 - 256*2) / 8
        var input = [UInt8](data)

        // Keccak padding (0x01, NOT SHA-3's 0x06)
        input.append(0x01)
        while input.count % rate != (rate - 1) { input.append(0x00) }
        input.append(0x80)

        // Absorb
        for blockStart in stride(from: 0, to: input.count, by: rate) {
            for i in 0..<(rate / 8) {
                let offset = blockStart + i * 8
                var word: UInt64 = 0
                for j in 0..<8 { word |= UInt64(input[offset + j]) << (j * 8) }
                state[i] ^= word
            }
            keccakF1600(&state)
        }

        // Squeeze (32 bytes)
        var output = Data(capacity: 32)
        for i in 0..<4 {
            var word = state[i]
            for _ in 0..<8 { output.append(UInt8(word & 0xFF)); word >>= 8 }
        }
        return output
    }

    /// Keccak-256 of a hex string (without 0x prefix).
    static func keccak256(hex: String) -> Data {
        keccak256(Data(hexString: hex) ?? Data())
    }

    // MARK: - ABI Encoding

    /// ABI encode a single address (left-padded to 32 bytes).
    static func abiEncode(address: String) -> Data {
        let clean = address.hasPrefix("0x") ? String(address.dropFirst(2)) : address
        let padded = String(repeating: "0", count: 64 - clean.count) + clean.lowercased()
        return Data(hexString: padded)!
    }

    /// ABI encode a single uint256.
    static func abiEncode(uint256: UInt64) -> Data {
        var data = Data(repeating: 0, count: 32)
        var value = uint256
        for i in stride(from: 31, through: 24, by: -1) {
            data[i] = UInt8(value & 0xFF)
            value >>= 8
        }
        return data
    }

    /// ABI encode a BigUInt from hex string (for uint256).
    static func abiEncode(uint256Hex: String) -> Data {
        let clean = uint256Hex.hasPrefix("0x") ? String(uint256Hex.dropFirst(2)) : uint256Hex
        let padded = String(repeating: "0", count: 64 - min(clean.count, 64)) + clean
        return Data(hexString: padded)!
    }

    /// ABI encode bytes32.
    static func abiEncode(bytes32: Data) -> Data {
        var result = Data(repeating: 0, count: 32)
        let copyLen = min(bytes32.count, 32)
        result.replaceSubrange(result.startIndex..<(result.startIndex + copyLen), with: bytes32.prefix(copyLen))
        return result
    }

    /// Concatenate hex strings (without 0x prefixes).
    static func concat(_ parts: [Data]) -> Data {
        parts.reduce(Data()) { $0 + $1 }
    }

    /// Get address from the last 20 bytes of a keccak256 hash.
    static func addressFrom(hash: Data) -> String {
        let bytes = hash.suffix(20)
        return "0x" + bytes.hexString
    }

    /// Encode function selector (first 4 bytes of keccak256 of signature).
    static func functionSelector(_ signature: String) -> Data {
        keccak256(Data(signature.utf8)).prefix(4)
    }

    // MARK: - CREATE2 Address

    /// Compute CREATE2 address: keccak256(0xff ++ factory ++ salt ++ initCodeHash)[12:]
    static func create2Address(factory: String, salt: Data, initCodeHash: Data) -> String {
        let factoryBytes = Data(hexString: factory.hasPrefix("0x") ? String(factory.dropFirst(2)) : factory)!
        var input = Data([0xFF])
        input += factoryBytes
        input += salt
        input += initCodeHash
        let hash = keccak256(input)
        return checksumAddress(hash.suffix(20).hexString)
    }

    /// EIP-55 checksum address.
    static func checksumAddress(_ address: String) -> String {
        let clean = address.hasPrefix("0x") ? String(address.dropFirst(2)).lowercased() : address.lowercased()
        let hash = keccak256(Data(clean.utf8)).hexString

        var result = "0x"
        for (i, char) in clean.enumerated() {
            let hashChar = hash[hash.index(hash.startIndex, offsetBy: i)]
            if "0123456789".contains(char) {
                result.append(char)
            } else if Int(String(hashChar), radix: 16)! >= 8 {
                result.append(char.uppercased().first!)
            } else {
                result.append(char)
            }
        }
        return result
    }

    // MARK: - Keccak-f[1600] Permutation

    private static func keccakF1600(_ state: inout [UInt64]) {
        let RC: [UInt64] = [
            0x0000000000000001, 0x0000000000008082, 0x800000000000808a, 0x8000000080008000,
            0x000000000000808b, 0x0000000080000001, 0x8000000080008081, 0x8000000000008009,
            0x000000000000008a, 0x0000000000000088, 0x0000000080008009, 0x000000008000000a,
            0x000000008000808b, 0x800000000000008b, 0x8000000000008089, 0x8000000000008003,
            0x8000000000008002, 0x8000000000000080, 0x000000000000800a, 0x800000008000000a,
            0x8000000080008081, 0x8000000000008080, 0x0000000080000001, 0x8000000080008008,
        ]

        // Standard pi lane and rotation constant tables
        let piLane = [10,7,11,17,18,3,5,16,8,21,24,4,15,23,19,13,12,2,20,14,22,9,6,1]
        let rotConst = [1,3,6,10,15,21,28,36,45,55,2,14,27,41,56,8,25,43,62,18,39,61,20,44]

        for round in 0..<24 {
            // θ (theta)
            var c = [UInt64](repeating: 0, count: 5)
            for x in 0..<5 { c[x] = state[x] ^ state[x+5] ^ state[x+10] ^ state[x+15] ^ state[x+20] }
            var d = [UInt64](repeating: 0, count: 5)
            for x in 0..<5 {
                d[x] = c[(x+4)%5] ^ ((c[(x+1)%5] << 1) | (c[(x+1)%5] >> 63))
            }
            for x in 0..<5 {
                for y in 0..<5 { state[y*5+x] ^= d[x] }
            }

            // ρ (rho) + π (pi)
            var current = state[1]
            for i in 0..<24 {
                let j = piLane[i]
                let temp = state[j]
                let r = rotConst[i]
                state[j] = (current << r) | (current >> (64 - r))
                current = temp
            }

            // χ (chi)
            for y in 0..<5 {
                var t = [UInt64](repeating: 0, count: 5)
                for x in 0..<5 { t[x] = state[y*5+x] }
                for x in 0..<5 {
                    state[y*5+x] = t[x] ^ (~t[(x+1)%5] & t[(x+2)%5])
                }
            }

            // ι (iota)
            state[0] ^= RC[round]
        }
    }
}
