import { describe, it, expect } from 'vitest';
import {
  BLE,
  encodeMessage,
  decodeMessage,
  chunkData,
  type BLERequest,
  type BLEResponse,
  type WalletInfo,
  type PendingRequest,
} from '../protocol';

// ─── BLE Constants ───

describe('BLE Constants', () => {
  it('service UUID is valid', () => {
    expect(BLE.SERVICE_UUID).toMatch(/^[0-9a-f-]+$/i);
    expect(BLE.SERVICE_UUID.length).toBe(36);
  });

  it('all UUIDs are unique', () => {
    const uuids = [BLE.SERVICE_UUID, BLE.REQUEST_UUID, BLE.RESPONSE_UUID, BLE.WALLET_INFO_UUID];
    expect(new Set(uuids).size).toBe(4);
  });

  it('max chunk size is reasonable', () => {
    expect(BLE.MAX_CHUNK_SIZE).toBeGreaterThanOrEqual(128);
    expect(BLE.MAX_CHUNK_SIZE).toBeLessThanOrEqual(4096);
  });
});

// ─── Message Encoding/Decoding ───

describe('encodeMessage', () => {
  it('encodes BLERequest to Uint8Array', () => {
    const request: BLERequest = {
      id: 'test-1',
      method: 'eth_sendTransaction',
      params: [{ to: '0x123', value: '0x1' }],
      origin: 'https://app.uniswap.org',
    };
    const encoded = encodeMessage(request);
    expect(encoded).toBeInstanceOf(Uint8Array);
    expect(encoded.length).toBeGreaterThan(0);
  });

  it('encodes BLEResponse to Uint8Array', () => {
    const response: BLEResponse = {
      id: 'test-1',
      result: '0xabc',
    };
    const encoded = encodeMessage(response);
    expect(encoded).toBeInstanceOf(Uint8Array);
  });

  it('encodes response with error', () => {
    const response: BLEResponse = {
      id: 'test-1',
      error: { code: 4001, message: 'User rejected' },
    };
    const encoded = encodeMessage(response);
    const decoded = decodeMessage<BLEResponse>(encoded.buffer);
    expect(decoded.error?.code).toBe(4001);
  });
});

describe('decodeMessage', () => {
  it('roundtrips BLERequest', () => {
    const original: BLERequest = {
      id: 'req-42',
      method: 'personal_sign',
      params: ['0xdeadbeef', '0x123'],
      origin: 'https://opensea.io',
      favicon: 'https://opensea.io/favicon.ico',
    };
    const encoded = encodeMessage(original);
    const decoded = decodeMessage<BLERequest>(encoded.buffer);
    expect(decoded.id).toBe(original.id);
    expect(decoded.method).toBe(original.method);
    expect(decoded.params).toEqual(original.params);
    expect(decoded.origin).toBe(original.origin);
    expect(decoded.favicon).toBe(original.favicon);
  });

  it('roundtrips BLEResponse with result', () => {
    const original: BLEResponse = {
      id: 'resp-1',
      result: ['0xabc123'],
    };
    const encoded = encodeMessage(original);
    const decoded = decodeMessage<BLEResponse>(encoded.buffer);
    expect(decoded.id).toBe('resp-1');
    expect(decoded.result).toEqual(['0xabc123']);
    expect(decoded.error).toBeUndefined();
  });

  it('roundtrips BLEResponse with error', () => {
    const original: BLEResponse = {
      id: 'resp-2',
      error: { code: -32603, message: 'Internal error' },
    };
    const encoded = encodeMessage(original);
    const decoded = decodeMessage<BLEResponse>(encoded.buffer);
    expect(decoded.result).toBeUndefined();
    expect(decoded.error).toEqual({ code: -32603, message: 'Internal error' });
  });

  it('handles complex params', () => {
    const request: BLERequest = {
      id: 'complex',
      method: 'eth_signTypedData_v4',
      params: ['0xaddr', { types: { EIP712Domain: [] }, primaryType: 'Test', domain: {}, message: { value: 42 } }],
      origin: 'https://app.example.com',
    };
    const encoded = encodeMessage(request);
    const decoded = decodeMessage<BLERequest>(encoded.buffer);
    expect(decoded.params[1]).toHaveProperty('primaryType', 'Test');
  });
});

// ─── Chunking ───

describe('chunkData', () => {
  it('returns single chunk for small data', () => {
    const data = new Uint8Array(100);
    const chunks = chunkData(data, 512);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual(data);
  });

  it('splits data into multiple chunks', () => {
    const data = new Uint8Array(1000);
    const chunks = chunkData(data, 512);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].length).toBe(512);
    expect(chunks[1].length).toBe(488);
  });

  it('handles exact multiple of chunk size', () => {
    const data = new Uint8Array(1024);
    const chunks = chunkData(data, 512);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].length).toBe(512);
    expect(chunks[1].length).toBe(512);
  });

  it('handles empty data', () => {
    const data = new Uint8Array(0);
    const chunks = chunkData(data, 512);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].length).toBe(0);
  });

  it('handles data smaller than chunk size', () => {
    const data = new Uint8Array(10);
    const chunks = chunkData(data);
    expect(chunks).toHaveLength(1);
  });

  it('uses default MAX_CHUNK_SIZE', () => {
    const data = new Uint8Array(BLE.MAX_CHUNK_SIZE + 100);
    const chunks = chunkData(data);
    expect(chunks).toHaveLength(2);
  });

  it('preserves data content through chunking', () => {
    const original = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const chunks = chunkData(original, 3);
    expect(chunks).toHaveLength(3); // [1,2,3], [4,5,6], [7,8]

    const reassembled = new Uint8Array(original.length);
    let offset = 0;
    for (const chunk of chunks) {
      reassembled.set(chunk, offset);
      offset += chunk.length;
    }
    expect(reassembled).toEqual(original);
  });
});

// ─── Type Shape Tests ───

describe('WalletInfo type', () => {
  it('can be encoded and decoded', () => {
    const info: WalletInfo = {
      address: '0x7a3F8c2D1b4E9f6A5d3C0e8B7a2F4d6E1c9e92B',
      chainId: 137,
      name: 'Personal',
    };
    const encoded = new TextEncoder().encode(JSON.stringify(info));
    const decoded = JSON.parse(new TextDecoder().decode(encoded)) as WalletInfo;
    expect(decoded.address).toBe(info.address);
    expect(decoded.chainId).toBe(137);
    expect(decoded.name).toBe('Personal');
  });
});

describe('PendingRequest type', () => {
  it('has required fields', () => {
    const pending: PendingRequest = {
      id: 'req-1',
      method: 'eth_sendTransaction',
      params: [{ to: '0x123' }],
      origin: 'https://example.com',
      favicon: 'https://example.com/icon.png',
      timestamp: Date.now(),
    };
    expect(pending.id).toBeDefined();
    expect(pending.method).toBeDefined();
    expect(pending.timestamp).toBeGreaterThan(0);
  });
});
