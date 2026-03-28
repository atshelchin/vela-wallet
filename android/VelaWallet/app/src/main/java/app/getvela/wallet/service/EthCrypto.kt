package app.getvela.wallet.service

/**
 * Ethereum cryptographic utilities: Keccak-256, ABI encoding, CREATE2.
 * Port of iOS EthCrypto.swift — must produce identical results.
 */
object EthCrypto {

    // Keccak round constants — parsed from hex strings to avoid Kotlin literal overflow
    private val RC: LongArray = arrayOf(
        "0000000000000001", "0000000000008082", "800000000000808a", "8000000080008000",
        "000000000000808b", "0000000080000001", "8000000080008081", "8000000000008009",
        "000000000000008a", "0000000000000088", "0000000080008009", "000000008000000a",
        "000000008000808b", "800000000000008b", "8000000000008089", "8000000000008003",
        "8000000000008002", "8000000000000080", "000000000000800a", "800000008000000a",
        "8000000080008081", "8000000000008080", "0000000080000001", "8000000080008008",
    ).map { java.lang.Long.parseUnsignedLong(it, 16) }.toLongArray()

    // MARK: - Keccak-256

    fun keccak256(data: ByteArray): ByteArray {
        val state = LongArray(25)
        val rate = 136
        val input = data.toMutableList()

        // Keccak padding (0x01, NOT SHA-3's 0x06)
        input.add(0x01)
        while (input.size % rate != rate - 1) input.add(0x00)
        input.add(0x80.toByte())

        // Absorb
        val bytes = input.toByteArray()
        for (blockStart in bytes.indices step rate) {
            for (i in 0 until rate / 8) {
                val offset = blockStart + i * 8
                var word = 0L
                for (j in 0 until 8) {
                    word = word or ((bytes[offset + j].toLong() and 0xFF) shl (j * 8))
                }
                state[i] = state[i] xor word
            }
            keccakF1600(state)
        }

        // Squeeze (32 bytes)
        val output = ByteArray(32)
        for (i in 0 until 4) {
            var word = state[i]
            for (j in 0 until 8) {
                output[i * 8 + j] = (word and 0xFF).toByte()
                word = word ushr 8
            }
        }
        return output
    }

    fun keccak256(hex: String): ByteArray = keccak256(hexToBytes(hex))

    // MARK: - ABI Encoding

    fun abiEncodeAddress(address: String): ByteArray {
        val clean = address.removePrefix("0x").lowercase()
        val padded = clean.padStart(64, '0')
        return hexToBytes(padded)
    }

    fun abiEncodeUint256(value: Long): ByteArray {
        val data = ByteArray(32)
        var v = value
        for (i in 31 downTo 24) {
            data[i] = (v and 0xFF).toByte()
            v = v shr 8
        }
        return data
    }

    fun abiEncodeUint256Hex(hex: String): ByteArray {
        val clean = hex.removePrefix("0x").ifEmpty { "0" }
        require(clean.length <= 64) { "uint256 hex overflow: ${clean.length} chars" }
        val padded = clean.padStart(64, '0')
        return hexToBytes(padded)
    }

    fun abiEncodeBytes32(data: ByteArray): ByteArray {
        val result = ByteArray(32)
        data.copyInto(result, 0, 0, minOf(data.size, 32))
        return result
    }

    // MARK: - Function Selector

    fun functionSelector(signature: String): ByteArray =
        keccak256(signature.toByteArray()).copyOf(4)

    // MARK: - Address from Hash

    fun addressFromHash(hash: ByteArray): String =
        "0x" + bytesToHex(hash.copyOfRange(12, 32))

    // MARK: - CREATE2

    fun create2Address(factory: String, salt: ByteArray, initCodeHash: ByteArray): String {
        val factoryBytes = hexToBytes(factory.removePrefix("0x"))
        val input = byteArrayOf(0xFF.toByte()) + factoryBytes + salt + initCodeHash
        val hash = keccak256(input)
        return checksumAddress(bytesToHex(hash.copyOfRange(12, 32)))
    }

    // MARK: - EIP-55 Checksum

    fun checksumAddress(address: String): String {
        val clean = address.removePrefix("0x").lowercase()
        val hash = bytesToHex(keccak256(clean.toByteArray()))
        val result = StringBuilder("0x")
        for (i in clean.indices) {
            val c = clean[i]
            if (c in '0'..'9') {
                result.append(c)
            } else {
                val hashNibble = hash[i].digitToInt(16)
                result.append(if (hashNibble >= 8) c.uppercaseChar() else c)
            }
        }
        return result.toString()
    }

    // MARK: - Hex Utilities

    fun hexToBytes(hex: String): ByteArray {
        val clean = hex.removePrefix("0x")
        return ByteArray(clean.length / 2) { i ->
            clean.substring(i * 2, i * 2 + 2).toInt(16).toByte()
        }
    }

    fun bytesToHex(bytes: ByteArray): String =
        bytes.joinToString("") { "%02x".format(it) }

    // MARK: - Keccak-f[1600]

    private fun keccakF1600(state: LongArray) {
        // Keccak round constants (RC) — exact values from FIPS 202
        val rc = RC

        val piLane = intArrayOf(10,7,11,17,18,3,5,16,8,21,24,4,15,23,19,13,12,2,20,14,22,9,6,1)
        val rotConst = intArrayOf(1,3,6,10,15,21,28,36,45,55,2,14,27,41,56,8,25,43,62,18,39,61,20,44)

        for (round in 0 until 24) {
            // θ
            val c = LongArray(5)
            for (x in 0..4) c[x] = state[x] xor state[x+5] xor state[x+10] xor state[x+15] xor state[x+20]
            val d = LongArray(5)
            for (x in 0..4) d[x] = c[(x+4)%5] xor c[(x+1)%5].rotateLeft(1)
            for (x in 0..4) for (y in 0..4) state[y*5+x] = state[y*5+x] xor d[x]

            // ρ + π
            var current = state[1]
            for (i in 0 until 24) {
                val j = piLane[i]
                val temp = state[j]
                state[j] = current.rotateLeft(rotConst[i])
                current = temp
            }

            // χ
            for (y in 0..4) {
                val t = LongArray(5) { state[y*5+it] }
                for (x in 0..4) state[y*5+x] = t[x] xor (t[(x+1)%5].inv() and t[(x+2)%5])
            }

            // ι
            state[0] = state[0] xor rc[round]
        }
    }

    private fun Long.rotateLeft(n: Int): Long = (this shl n) or (this ushr (64 - n))
}
