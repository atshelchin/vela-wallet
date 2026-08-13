/**
 * @jest-environment jsdom
 */
/**
 * The web download/pick paths — the coverage the platform-pair collapse dropped.
 *
 * The old file-io.test.ts asserted the Android SAF and iOS share-sheet halves,
 * which retired with the Expo native path. What ships now is the DOM half, and
 * it was the one part of the collapse left untested because asserting it needs
 * a real `document` (this file is why jest-environment-jsdom is installed).
 *
 * jsdom quirk pinned here on purpose: it implements Blob but NOT
 * URL.createObjectURL/revokeObjectURL, so those two are test doubles — which is
 * also exactly what lets the test assert the url lifecycle (created from the
 * blob, revoked after the click, never leaked).
 */
import { pickTable, saveTextFile } from '@/services/file-io';

// jsdom's Blob/File implement neither .text() nor .arrayBuffer() (every real
// browser has both), and `pickTable` awaits them. Backfill via FileReader so the
// module under test runs unmodified — delete when jsdom catches up.
if (typeof Blob.prototype.text !== 'function') {
  Blob.prototype.text = function text() {
    return new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => rej(r.error);
      r.readAsText(this);
    });
  };
}
if (typeof Blob.prototype.arrayBuffer !== 'function') {
  Blob.prototype.arrayBuffer = function arrayBuffer() {
    return new Promise<ArrayBuffer>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as ArrayBuffer);
      r.onerror = () => rej(r.error);
      r.readAsArrayBuffer(this);
    });
  };
}

const readBlob = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsText(b);
  });

describe('saveTextFile (web download path)', () => {
  const createObjectURL = jest.fn((_blob: Blob) => 'blob:vela-test');
  const revokeObjectURL = jest.fn();
  let clickSpy: jest.SpyInstance;

  beforeEach(() => {
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });
  afterEach(() => {
    clickSpy.mockRestore();
    expect(document.body.childElementCount).toBe(0); // nothing may leak into the DOM
  });

  it('streams the exact content through a download anchor named after the file', async () => {
    await saveTextFile('contacts.csv', 'name,address\nAlice,0xabc', 'text/csv');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe('text/csv;charset=utf-8');
    await expect(readBlob(blob)).resolves.toBe('name,address\nAlice,0xabc');

    // The anchor carried the right identity when it was clicked…
    expect(clickSpy).toHaveBeenCalledTimes(1);
    const anchor = clickSpy.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toBe('contacts.csv');
    expect(anchor.href).toBe('blob:vela-test');
    // …and both the anchor and the object URL were released afterwards.
    expect(anchor.isConnected).toBe(false);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:vela-test');
  });

  it('defaults to text/plain', async () => {
    await saveTextFile('note.txt', 'hello');
    const blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe('text/plain;charset=utf-8');
  });
});

describe('pickTable (web file-pick path)', () => {
  afterEach(() => {
    expect(document.body.childElementCount).toBe(0);
  });

  /** Start a pick, hand the transient input the given file (or a cancel). */
  const drive = (file: File | null) => {
    const picked = pickTable();
    const input = document.querySelector<HTMLInputElement>('[data-testid="file-picker-input"]');
    expect(input).not.toBeNull();
    if (file) {
      Object.defineProperty(input!, 'files', { value: [file], configurable: true });
      input!.dispatchEvent(new Event('change'));
    } else {
      input!.dispatchEvent(new Event('cancel'));
    }
    return picked;
  };

  it('reads a text-family file as text', async () => {
    const picked = await drive(new File(['a,b\n1,2'], 'table.csv', { type: 'text/csv' }));
    expect(picked).toEqual({ name: 'table.csv', text: 'a,b\n1,2' });
  });

  it('reads an Excel file as bytes, never as text', async () => {
    const picked = await drive(new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], 'payroll.xlsx'));
    expect(picked?.name).toBe('payroll.xlsx');
    expect(picked?.text).toBeUndefined();
    expect(Array.from(picked?.bytes ?? [])).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  it('resolves null when the picker is cancelled', async () => {
    await expect(drive(null)).resolves.toBeNull();
  });

  it('resolves null when change fires with no file selected', async () => {
    const picked = pickTable();
    const input = document.querySelector<HTMLInputElement>('[data-testid="file-picker-input"]')!;
    Object.defineProperty(input, 'files', { value: [], configurable: true });
    input.dispatchEvent(new Event('change'));
    await expect(picked).resolves.toBeNull();
  });
});
