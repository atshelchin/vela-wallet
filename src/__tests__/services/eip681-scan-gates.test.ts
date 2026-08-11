/**
 * `parseEIP681` — the two things a scanned `ethereum:` URI is not allowed to
 * become.
 *
 * This parser is the ONLY reading of an `ethereum:` URI in the product (web and
 * native share this file), and its output goes straight into a locked Send:
 * recipient, chain, token and amount, all prefilled, the amount field frozen
 * when the URI named one. So the failures worth pinning are not "we returned
 * null for junk" — they are the two shapes that used to return something
 * *confident and wrong*.
 *
 * Both fixes decline rather than guess, and declining is a live path in both
 * callers: the home scanner shows `home.invalidQr*`, the Send scanner drops the
 * text into the (editable) recipient field.
 */
import { parseEIP681 } from '@/services/eip681';

const ME = '0x' + '11'.repeat(20);
const USDC = '0x' + '22'.repeat(20);

describe('a function call we do not implement is not a payment', () => {
  test.each(['approve', 'setApprovalForAll', 'transferFrom', 'mint'])(
    '/%s is declined, not turned into a native send to the contract',
    (fn) => {
      // The old fall-through read `target` (the CONTRACT) as the recipient and
      // returned `isNative: true` — a locked send of ETH to a token address.
      expect(parseEIP681(`ethereum:${USDC}@1/${fn}?address=${ME}&uint256=100`)).toBeNull();
    },
  );

  test('a bare trailing slash is still a plain native request', () => {
    expect(parseEIP681(`ethereum:${ME}@1/`)).toMatchObject({
      chainId: 1,
      recipient: ME,
      isNative: true,
    });
  });

  test('/transfer itself is untouched', () => {
    expect(parseEIP681(`ethereum:${USDC}@137/transfer?address=${ME}&uint256=1500000`)).toEqual({
      chainId: 137,
      recipient: ME,
      tokenAddress: USDC,
      amountBaseUnits: 1500000n,
      isNative: false,
    });
  });
});

describe("a transfer call's `value` is ether, not the token argument", () => {
  test('value= on /transfer names no token amount', () => {
    // `value=1e18` means "attach 1 ETH to the call". Read as USDC base units it
    // prefilled 10^12 USDC into a send whose amount field was then FROZEN.
    const r = parseEIP681(`ethereum:${USDC}@1/transfer?address=${ME}&value=1000000000000000000`);
    expect(r).toMatchObject({ recipient: ME, tokenAddress: USDC, isNative: false });
    expect(r!.amountBaseUnits).toBeUndefined();
  });

  test('uint256 still wins, and a URI carrying both takes uint256', () => {
    const r = parseEIP681(
      `ethereum:${USDC}@1/transfer?address=${ME}&uint256=250000&value=1000000000000000000`,
    );
    expect(r!.amountBaseUnits).toBe(250000n);
  });

  test('a native request still reads value=', () => {
    const r = parseEIP681(`ethereum:${ME}@1?value=100000000000000000`);
    expect(r!.amountBaseUnits).toBe(100000000000000000n);
  });
});
