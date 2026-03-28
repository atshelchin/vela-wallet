package app.getvela.wallet

import app.getvela.wallet.service.BLEPeripheralService
import app.getvela.wallet.service.PasskeyService
import org.junit.Assert.*
import org.junit.Test

/**
 * BLE protocol tests — UUID format, message parsing, DER conversion.
 * Mirrors iOS BLETests.swift.
 */
class BLEProtocolTest {

    // MARK: - UUID Format

    @Test
    fun serviceUUID_correctFormat() {
        val uuid = BLEPeripheralService.SERVICE_UUID.toString()
        assertTrue(uuid.contains("be1a"))
        assertEquals(36, uuid.length) // UUID format: 8-4-4-4-12
    }

    @Test
    fun allUUIDs_sharePrefix() {
        val service = BLEPeripheralService.SERVICE_UUID.toString()
        val request = BLEPeripheralService.REQUEST_CHAR_UUID.toString()
        val response = BLEPeripheralService.RESPONSE_CHAR_UUID.toString()
        val walletInfo = BLEPeripheralService.WALLET_INFO_CHAR_UUID.toString()

        // All share the same base: xxxx-0000-1000-8000-00805f9b34fb
        val suffix = "-0000-1000-8000-00805f9b34fb"
        assertTrue(service.endsWith(suffix))
        assertTrue(request.endsWith(suffix))
        assertTrue(response.endsWith(suffix))
        assertTrue(walletInfo.endsWith(suffix))
    }

    @Test
    fun uuids_areDistinct() {
        val uuids = setOf(
            BLEPeripheralService.SERVICE_UUID,
            BLEPeripheralService.REQUEST_CHAR_UUID,
            BLEPeripheralService.RESPONSE_CHAR_UUID,
            BLEPeripheralService.WALLET_INFO_CHAR_UUID,
        )
        assertEquals(4, uuids.size)
    }

    // MARK: - DER Signature

    @Test
    fun derToRaw_standardSignature() {
        val passkeyService = PasskeyService()
        // Standard DER: 30 44 02 20 <r:32> 02 20 <s:32>
        val r = ByteArray(32) { 0x11 }
        val s = ByteArray(32) { 0x22 }
        val der = byteArrayOf(0x30, 0x44, 0x02, 0x20) + r + byteArrayOf(0x02, 0x20) + s

        val raw = passkeyService.derSignatureToRaw(der)
        assertNotNull(raw)
        assertEquals(64, raw!!.size)
        assertArrayEquals(r, raw.copyOfRange(0, 32))
        assertArrayEquals(s, raw.copyOfRange(32, 64))
    }

    @Test
    fun derToRaw_withLeadingZero() {
        val passkeyService = PasskeyService()
        val r = byteArrayOf(0x00) + ByteArray(32) { 0xAA.toByte() } // 33 bytes
        val s = byteArrayOf(0x00) + ByteArray(32) { 0xBB.toByte() } // 33 bytes
        val der = byteArrayOf(0x30, 0x46, 0x02, 0x21) + r + byteArrayOf(0x02, 0x21) + s

        val raw = passkeyService.derSignatureToRaw(der)
        assertNotNull(raw)
        assertEquals(64, raw!!.size)
    }

    @Test
    fun derToRaw_invalidInput() {
        val passkeyService = PasskeyService()
        assertNull(passkeyService.derSignatureToRaw(byteArrayOf(0x00)))
        assertNull(passkeyService.derSignatureToRaw(ByteArray(0)))
    }

    // MARK: - UserID Encoding

    @Test
    fun userID_roundtrip() {
        val name = "Test Wallet"
        val encoded = PasskeyService.encodeUserID(name)
        val decoded = PasskeyService.decodeUserName(encoded)
        assertEquals(name, decoded)
    }

    @Test
    fun userID_containsNullSeparator() {
        val encoded = String(PasskeyService.encodeUserID("Test"))
        assertTrue(encoded.contains("\u0000"))
    }
}
