package app.getvela.wallet

import app.getvela.wallet.service.EthCrypto
import org.junit.Assert.*
import org.junit.Test

/**
 * EthCrypto unit tests — test vectors must match iOS EthCryptoTests.swift exactly.
 */
class EthCryptoTest {

    // MARK: - Keccak-256

    @Test
    fun keccak256_emptyInput() {
        val result = EthCrypto.bytesToHex(EthCrypto.keccak256(ByteArray(0)))
        assertEquals("c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470", result)
    }

    @Test
    fun keccak256_hello() {
        val result = EthCrypto.bytesToHex(EthCrypto.keccak256("hello".toByteArray()))
        assertEquals("1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8", result)
    }

    @Test
    fun keccak256_abc() {
        val result = EthCrypto.bytesToHex(EthCrypto.keccak256("abc".toByteArray()))
        assertEquals("4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45", result)
    }

    @Test
    fun keccak256_outputIs32Bytes() {
        val result = EthCrypto.keccak256("test".toByteArray())
        assertEquals(32, result.size)
    }

    @Test
    fun keccak256_deterministic() {
        val a = EthCrypto.keccak256("deterministic".toByteArray())
        val b = EthCrypto.keccak256("deterministic".toByteArray())
        assertArrayEquals(a, b)
    }

    @Test
    fun keccak256_differentInputs() {
        val a = EthCrypto.keccak256("a".toByteArray())
        val b = EthCrypto.keccak256("b".toByteArray())
        assertFalse(a.contentEquals(b))
    }

    // MARK: - Function Selectors

    @Test
    fun functionSelector_transfer() {
        val selector = EthCrypto.bytesToHex(EthCrypto.functionSelector("transfer(address,uint256)"))
        assertEquals("a9059cbb", selector)
    }

    @Test
    fun functionSelector_setup() {
        val selector = EthCrypto.bytesToHex(EthCrypto.functionSelector("setup(address[],uint256,address,bytes,address,address,uint256,address)"))
        assertEquals("b63e800d", selector)
    }

    @Test
    fun functionSelector_enableModules() {
        val selector = EthCrypto.bytesToHex(EthCrypto.functionSelector("enableModules(address[])"))
        assertEquals("8d0dc49f", selector)
    }

    @Test
    fun functionSelector_configure() {
        val selector = EthCrypto.bytesToHex(EthCrypto.functionSelector("configure((uint256,uint256,uint176))"))
        assertEquals("0dd9692f", selector)
    }

    @Test
    fun functionSelector_multiSend() {
        val selector = EthCrypto.bytesToHex(EthCrypto.functionSelector("multiSend(bytes)"))
        assertEquals("8d80ff0a", selector)
    }

    @Test
    fun functionSelector_is4Bytes() {
        val selector = EthCrypto.functionSelector("transfer(address,uint256)")
        assertEquals(4, selector.size)
    }

    // MARK: - ABI Encoding

    @Test
    fun abiEncodeAddress_zero() {
        val result = EthCrypto.abiEncodeAddress("0x0000000000000000000000000000000000000000")
        assertEquals(32, result.size)
        assertEquals("0000000000000000000000000000000000000000000000000000000000000000", EthCrypto.bytesToHex(result))
    }

    @Test
    fun abiEncodeAddress_withValue() {
        val result = EthCrypto.abiEncodeAddress("0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226")
        assertEquals(32, result.size)
        assertTrue(EthCrypto.bytesToHex(result).endsWith("75cf11467937ce3f2f357ce24ffc3dbf8fd5c226"))
    }

    @Test
    fun abiEncodeUint256_zero() {
        val result = EthCrypto.abiEncodeUint256(0)
        assertEquals(32, result.size)
        assertArrayEquals(ByteArray(32), result)
    }

    @Test
    fun abiEncodeUint256_one() {
        val result = EthCrypto.abiEncodeUint256(1)
        assertEquals(32, result.size)
        assertEquals(1, result[31].toInt())
        assertEquals(0, result[30].toInt())
    }

    @Test
    fun abiEncodeUint256_256() {
        val result = EthCrypto.abiEncodeUint256(256)
        assertEquals(32, result.size)
        assertEquals(0, result[31].toInt())
        assertEquals(1, result[30].toInt())
    }

    @Test
    fun abiEncodeUint256Hex_0x100() {
        val result = EthCrypto.abiEncodeUint256Hex("100")
        assertEquals(32, result.size)
        assertEquals(0, result[31].toInt())
        assertEquals(1, result[30].toInt())
    }

    @Test
    fun abiEncodeBytes32_full() {
        val input = ByteArray(32) { 0xAB.toByte() }
        val result = EthCrypto.abiEncodeBytes32(input)
        assertEquals(32, result.size)
        assertArrayEquals(input, result)
    }

    @Test
    fun abiEncodeBytes32_shorter() {
        val input = byteArrayOf(0x01, 0x02)
        val result = EthCrypto.abiEncodeBytes32(input)
        assertEquals(32, result.size)
        assertEquals(0x01, result[0].toInt())
        assertEquals(0x02, result[1].toInt())
        assertEquals(0x00, result[2].toInt())
    }

    // MARK: - EIP-55 Checksum

    @Test
    fun checksumAddress_hasPrefix() {
        val result = EthCrypto.checksumAddress("0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359")
        assertTrue(result.startsWith("0x"))
        assertEquals(42, result.length)
    }

    // MARK: - Hex Utilities

    @Test
    fun hexToBytes_and_back() {
        val hex = "01abcd"
        val bytes = EthCrypto.hexToBytes(hex)
        assertEquals(3, bytes.size)
        assertEquals(0x01, bytes[0].toInt())
        assertEquals(0xAB.toByte(), bytes[1])
        assertEquals(0xCD.toByte(), bytes[2])
        assertEquals(hex, EthCrypto.bytesToHex(bytes))
    }

    @Test
    fun bytesToHex_empty() {
        assertEquals("", EthCrypto.bytesToHex(ByteArray(0)))
    }

    // MARK: - EIP-712 Type Hashes

    @Test
    fun domainTypeHash() {
        val result = EthCrypto.bytesToHex(EthCrypto.keccak256("EIP712Domain(uint256 chainId,address verifyingContract)".toByteArray()))
        assertEquals("47e79534a245952e8b16893a336b85a3d9ea9fa8c573f3d803afb92a79469218", result)
    }

    @Test
    fun safeOpTypeHash() {
        val result = EthCrypto.bytesToHex(EthCrypto.keccak256(
            "SafeOp(address safe,uint256 nonce,bytes initCode,bytes callData,uint128 verificationGasLimit,uint128 callGasLimit,uint256 preVerificationGas,uint128 maxPriorityFeePerGas,uint128 maxFeePerGas,bytes paymasterAndData,uint48 validAfter,uint48 validUntil,address entryPoint)".toByteArray()
        ))
        assertEquals("c03dfc11d8b10bf9cf703d558958c8c42777f785d998c62060d85a4f0ef6ea7f", result)
    }
}
