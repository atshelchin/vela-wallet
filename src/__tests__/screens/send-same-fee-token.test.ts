/** Regression guard: the confirmation page must not allow a same-token fee send
 * that already exceeds the wallet balance. The controller is not renderable in
 * this Jest environment, so pin the two boundaries (calculation + recovery UI). */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const root = resolve(__dirname, '../../..');
const controller = readFileSync(resolve(root, 'src/screens/wallet/useSendController.ts'), 'utf8');
const confirm = readFileSync(resolve(root, 'src/screens/wallet/ConfirmStep.tsx'), 'utf8');

describe('same fee-token transfer guard', () => {
  test('carries the core’s same-asset ceiling breach through to the view', () => {
    // The ceiling itself is `fee_policy::same_asset_fee_limit`, decided in
    // `send.rs` — the shell used to recompute it and must not start again. What
    // it owes is the mapping: every field of the core's issue, unmodified, so
    // the confirm step can show the exact recovery.
    expect(controller).toContain('sameAssetFeeIssue: SameAssetFeeIssue | null');
    expect(controller).toContain('maxTransferAmount: BigInt(issue.max_transfer_amount');
    expect(controller).not.toMatch(/sameAssetFeeLimit\(/);
  });

  test('shows the exact recovery and replaces the send slide with an edit action', () => {
    expect(confirm).toContain("t('send.sameFeeTokenMax'");
    expect(confirm).toContain("title={t('send.sameFeeTokenEdit')}");
    expect(confirm).toContain('onPress={handleEditAmount}');
  });
});
