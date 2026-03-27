package app.getvela.wallet

import app.getvela.wallet.model.formatBalance
import app.getvela.wallet.model.shortAddr
import app.getvela.wallet.service.PasskeyService
import org.junit.Assert.*
import org.junit.Test

/**
 * Utility function tests — formatBalance, shortAddr, PasskeyService helpers.
 */
class UtilityTest {

    // MARK: - formatBalance

    @Test
    fun formatBalance_zero() {
        assertEquals("0", formatBalance(0.0))
    }

    @Test
    fun formatBalance_large() {
        val result = formatBalance(1234.5678)
        assertTrue(result.contains("1234"))  // should have 2 decimal places
    }

    @Test
    fun formatBalance_medium() {
        val result = formatBalance(5.123456)
        assertTrue(result.contains("5.1234") || result.contains("5.1235"))
    }

    @Test
    fun formatBalance_small() {
        val result = formatBalance(0.00123)
        assertTrue(result.isNotEmpty())
        assertNotEquals("0", result)
    }

    // MARK: - shortAddr

    @Test
    fun shortAddr_longAddress() {
        val addr = "0x7a3F8c2D1b4E9f6A5d3C0e8B7a2F4d6E1c9e92Ba"
        val result = shortAddr(addr)
        // take(8) = "0x7a3F8c", takeLast(6) = "9e92Ba"
        assertEquals("0x7a3F8c...9e92Ba", result)
    }

    @Test
    fun shortAddr_shortString() {
        val result = shortAddr("0x1234")
        assertEquals("0x1234", result)
    }

    @Test
    fun shortAddr_exactly12Chars() {
        val result = shortAddr("123456789012")
        assertEquals("123456789012", result)
    }

    @Test
    fun shortAddr_13Chars() {
        val result = shortAddr("1234567890123")
        assertEquals("12345678...890123", result)
    }

    // MARK: - PasskeyService UserID encoding

    @Test
    fun encodeUserID_containsName() {
        val encoded = PasskeyService.encodeUserID("TestUser")
        val str = String(encoded)
        assertTrue(str.startsWith("TestUser\u0000"))
    }

    @Test
    fun decodeUserName_extractsName() {
        val encoded = "MyWallet\u0000some-uuid-here".toByteArray()
        val name = PasskeyService.decodeUserName(encoded)
        assertEquals("MyWallet", name)
    }

    @Test
    fun decodeUserName_roundtrip() {
        val originalName = "Personal Wallet"
        val encoded = PasskeyService.encodeUserID(originalName)
        val decoded = PasskeyService.decodeUserName(encoded)
        assertEquals(originalName, decoded)
    }

    // MARK: - DER Signature Conversion

    @Test
    fun derSignatureToRaw_valid() {
        val passkeyService = PasskeyService()
        // DER: 30 44 02 20 <r 32 bytes> 02 20 <s 32 bytes>
        val der = byteArrayOf(0x30, 0x44, 0x02, 0x20) +
            ByteArray(32) { 0xAA.toByte() } +
            byteArrayOf(0x02, 0x20) +
            ByteArray(32) { 0xBB.toByte() }

        val raw = passkeyService.derSignatureToRaw(der)
        assertNotNull(raw)
        assertEquals(64, raw!!.size)
        assertTrue(raw.copyOfRange(0, 32).all { it == 0xAA.toByte() })
        assertTrue(raw.copyOfRange(32, 64).all { it == 0xBB.toByte() })
    }

    @Test
    fun derSignatureToRaw_stripsLeadingZero() {
        val passkeyService = PasskeyService()
        val der = byteArrayOf(0x30, 0x46, 0x02, 0x21, 0x00) +
            ByteArray(32) { 0xAA.toByte() } +
            byteArrayOf(0x02, 0x21, 0x00) +
            ByteArray(32) { 0xBB.toByte() }

        val raw = passkeyService.derSignatureToRaw(der)
        assertNotNull(raw)
        assertEquals(64, raw!!.size)
    }

    @Test
    fun derSignatureToRaw_padsShortR() {
        val passkeyService = PasskeyService()
        val der = byteArrayOf(0x30, 0x43, 0x02, 0x1F) +
            ByteArray(31) { 0xAA.toByte() } +
            byteArrayOf(0x02, 0x20) +
            ByteArray(32) { 0xBB.toByte() }

        val raw = passkeyService.derSignatureToRaw(der)
        assertNotNull(raw)
        assertEquals(64, raw!!.size)
        assertEquals(0x00, raw[0].toInt())
        assertEquals(0xAA.toByte(), raw[1])
    }

    @Test
    fun derSignatureToRaw_invalidInput() {
        val passkeyService = PasskeyService()
        val raw = passkeyService.derSignatureToRaw(byteArrayOf(0x00, 0x01))
        assertNull(raw)
    }

    @Test
    fun derSignatureToRaw_emptyInput() {
        val passkeyService = PasskeyService()
        val raw = passkeyService.derSignatureToRaw(ByteArray(0))
        assertNull(raw)
    }
}
