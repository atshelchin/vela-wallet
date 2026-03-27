package app.getvela.wallet

import app.getvela.wallet.service.EthCrypto
import app.getvela.wallet.service.SafeAddressComputer
import org.junit.Assert.*
import org.junit.Test

/**
 * SafeAddressComputer unit tests — test vectors from iOS SafeAddressTests.swift.
 * These MUST match the TypeScript reference implementation exactly.
 */
class SafeAddressComputerTest {

    // Known test key from iOS tests
    private val testPublicKey = "04a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90b1c2d3e4f50617283940a1b2c3d4e5f6b1c2d3e4f50617283940a1b2c3d4e5f6"
    private val expectedAddress = "0x762EdA60D3B68755c271D608644650278f88329F"
    private val expectedSaltNonce = "ff558186314810b914e7a54ec8f9dee960ff493364c68ba36e07dd89f547787a"
    private val expectedSetupDataHash = "b0d27e7ff8c758797463d1d9b3cfe53cd9c7ff2a92f037cd261b4f90f5de0191"

    // MARK: - Public Key Parsing

    @Test
    fun parsePublicKey_withPrefix() {
        val (x, y) = SafeAddressComputer.parsePublicKey(testPublicKey)
        assertEquals(32, x.size)
        assertEquals(32, y.size)
        assertEquals("a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90", EthCrypto.bytesToHex(x))
        assertEquals("b1c2d3e4f50617283940a1b2c3d4e5f6b1c2d3e4f50617283940a1b2c3d4e5f6", EthCrypto.bytesToHex(y))
    }

    @Test
    fun parsePublicKey_with0xPrefix() {
        val (x, y) = SafeAddressComputer.parsePublicKey("0x$testPublicKey")
        assertEquals(32, x.size)
        assertEquals(32, y.size)
    }

    @Test
    fun parsePublicKey_without04Prefix() {
        val rawKey = testPublicKey.drop(2)
        val (x, y) = SafeAddressComputer.parsePublicKey(rawKey)
        assertEquals(32, x.size)
        assertEquals(32, y.size)
    }

    @Test
    fun parsePublicKey_invalidLength() {
        val (x, y) = SafeAddressComputer.parsePublicKey("04aabb")
        assertEquals(0, x.size)
        assertEquals(0, y.size)
    }

    // MARK: - Salt Nonce

    @Test
    fun saltNonce_matchesTypeScript() {
        val (x, y) = SafeAddressComputer.parsePublicKey(testPublicKey)
        val saltNonce = EthCrypto.keccak256(EthCrypto.abiEncodeBytes32(x) + EthCrypto.abiEncodeBytes32(y))
        assertEquals(expectedSaltNonce, EthCrypto.bytesToHex(saltNonce))
    }

    @Test
    fun saltNonce_is32Bytes() {
        val (x, y) = SafeAddressComputer.parsePublicKey(testPublicKey)
        val saltNonce = EthCrypto.keccak256(EthCrypto.abiEncodeBytes32(x) + EthCrypto.abiEncodeBytes32(y))
        assertEquals(32, saltNonce.size)
    }

    @Test
    fun saltNonce_deterministic() {
        val (x, y) = SafeAddressComputer.parsePublicKey(testPublicKey)
        val a = EthCrypto.keccak256(EthCrypto.abiEncodeBytes32(x) + EthCrypto.abiEncodeBytes32(y))
        val b = EthCrypto.keccak256(EthCrypto.abiEncodeBytes32(x) + EthCrypto.abiEncodeBytes32(y))
        assertArrayEquals(a, b)
    }

    // MARK: - Setup Data

    @Test
    fun setupDataHash_matchesTypeScript() {
        val (x, y) = SafeAddressComputer.parsePublicKey(testPublicKey)
        val setupData = SafeAddressComputer.encodeSetupData(x, y)
        val hash = EthCrypto.bytesToHex(EthCrypto.keccak256(setupData))
        assertEquals(expectedSetupDataHash, hash)
    }

    @Test
    fun setupData_notEmpty() {
        val (x, y) = SafeAddressComputer.parsePublicKey(testPublicKey)
        val setupData = SafeAddressComputer.encodeSetupData(x, y)
        assertTrue(setupData.isNotEmpty())
    }

    @Test
    fun setupData_startsWithSelector() {
        val (x, y) = SafeAddressComputer.parsePublicKey(testPublicKey)
        val setupData = SafeAddressComputer.encodeSetupData(x, y)
        val setupSelector = EthCrypto.functionSelector("setup(address[],uint256,address,bytes,address,address,uint256,address)")
        assertArrayEquals(setupSelector, setupData.copyOfRange(0, 4))
    }

    @Test
    fun setupData_deterministic() {
        val (x, y) = SafeAddressComputer.parsePublicKey(testPublicKey)
        val a = SafeAddressComputer.encodeSetupData(x, y)
        val b = SafeAddressComputer.encodeSetupData(x, y)
        assertArrayEquals(a, b)
    }

    // MARK: - Full Address Computation

    @Test
    fun computeAddress_matchesTypeScript() {
        val address = SafeAddressComputer.computeAddress(testPublicKey)
        assertEquals(expectedAddress, address)
    }

    @Test
    fun computeAddress_isChecksummed() {
        val address = SafeAddressComputer.computeAddress(testPublicKey)
        assertTrue(address.startsWith("0x"))
        assertEquals(42, address.length)
        val body = address.drop(2)
        assertTrue(body.any { it.isUpperCase() })
    }

    @Test
    fun computeAddress_deterministic() {
        val a = SafeAddressComputer.computeAddress(testPublicKey)
        val b = SafeAddressComputer.computeAddress(testPublicKey)
        assertEquals(a, b)
    }

    @Test
    fun computeAddress_accepts0xPrefix() {
        val a = SafeAddressComputer.computeAddress(testPublicKey)
        val b = SafeAddressComputer.computeAddress("0x$testPublicKey")
        assertEquals(a, b)
    }

    @Test
    fun differentKeys_differentAddresses() {
        val key2 = "04" + "cc".repeat(32) + "dd".repeat(32)
        val addr1 = SafeAddressComputer.computeAddress(testPublicKey)
        val addr2 = SafeAddressComputer.computeAddress(key2)
        assertNotEquals(addr1, addr2)
    }

    // MARK: - Contract Constants

    @Test
    fun contractAddresses_areValid() {
        val addresses = listOf(
            SafeAddressComputer.SAFE_PROXY_FACTORY,
            SafeAddressComputer.SAFE_SINGLETON,
            SafeAddressComputer.ENTRY_POINT,
            SafeAddressComputer.SAFE_4337_MODULE,
            SafeAddressComputer.SAFE_MODULE_SETUP,
            SafeAddressComputer.WEB_AUTHN_SIGNER,
            SafeAddressComputer.MULTI_SEND,
        )
        for (addr in addresses) {
            assertTrue("$addr should start with 0x", addr.startsWith("0x"))
            assertEquals("$addr should be 42 chars", 42, addr.length)
        }
    }
}
