/**
 * The only place the `batch_import` core touches the outside world.
 *
 * Three operations, three existing service calls: the USD→fiat rate source,
 * the file picker (+ the lazy SheetJS flattening an `.xlsx` into a cell
 * matrix), and the template save. Nothing here branches on business meaning —
 * picking the `BatchShellResult` variant is *reporting what was observed*, and
 * every rule that reads those observations (what a cancelled pick does to
 * `busy`, whether a rate for a stale currency counts) lives in Rust.
 *
 * Failure contract (shared effect loop): nothing rejects. Every rejection is
 * converted into the result variant that operation answers with, so the core
 * keeps ownership of classification.
 */

import { getRate } from '@/services/currency';
import { pickTable, saveTextFile } from '@/services/file-io';
import { readWorkbookMatrix } from '@/services/recipient-table';

import type { BatchShellResult } from './generated/BatchShellResult';
import type { BatchEffect } from './batch-import-types';

/**
 * SheetJS cells arrive as `any` (numbers survive `raw: false` in odd sheets,
 * ragged rows come back short). The core's wire type is `Vec<Vec<String>>`, so
 * the matrix is normalized here exactly as `interpretRows` does today
 * (`String(c ?? '')`) — the trim itself stays in the core.
 */
function toStringMatrix(rows: string[][]): string[][] {
  return rows.map((row) => (row ?? []).map((cell) => String(cell ?? '')));
}

export async function executeBatchOperation(effect: BatchEffect): Promise<BatchShellResult> {
  const operation = effect.operation;
  switch (operation.type) {
    case 'fetch_usd_fiat_rate': {
      // `getRate` already falls back to 1 for an unpriceable code; a thrown
      // source lands in `batchOperationFailure` as `rate: null`.
      const rate = await getRate(operation.code);
      return { type: 'rate_resolved', code: operation.code, rate };
    }
    case 'pick_file': {
      const picked = await pickTable();
      if (!picked) return { type: 'file_pick_cancelled' };
      if (picked.text != null) {
        return { type: 'file_picked', name: picked.name, content: { type: 'text', text: picked.text } };
      }
      if (picked.bytes) {
        // Excel only: ~1MB of SheetJS stays off the startup path (lazy import
        // inside `readWorkbookMatrix`), and the core parses the matrix.
        return {
          type: 'file_picked',
          name: picked.name,
          content: { type: 'matrix', rows: toStringMatrix(await readWorkbookMatrix(picked.bytes)) },
        };
      }
      return { type: 'file_pick_failed' };
    }
    case 'save_template_file':
      await saveTextFile(operation.name, operation.contents, operation.mime);
      return { type: 'template_saved' };
  }
}

export function batchOperationFailure(effect: BatchEffect, _error: unknown): BatchShellResult {
  switch (effect.operation.type) {
    case 'fetch_usd_fiat_rate':
      // No source could price it — the core turns this into the "enter one
      // manually" hint, never a silent zero.
      return { type: 'rate_resolved', code: effect.operation.code, rate: null };
    case 'pick_file':
      // Unreadable / unparseable file — the controller shows today's alert.
      return { type: 'file_pick_failed' };
    case 'save_template_file':
      // Share sheet dismissed or unavailable — silently keep the plain label.
      return { type: 'template_save_failed' };
  }
}
