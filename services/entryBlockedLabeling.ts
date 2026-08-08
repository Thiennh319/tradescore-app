/**
 * FIX_HARD_REASON_LABELING helpers — label/rename only; same block OR formula.
 * Flag default OFF → callers keep legacy hardBlocked field + legacy reason fallback.
 */

import { isFixHardReasonLabelingEnabled } from '../config/featureFlags';

export type EntryBlockedFields = {
  /** Legacy name — always set (mirrored) so untouched exporters keep compiling. */
  hardBlocked: boolean;
  /**
   * Preferred name when FIX_HARD_REASON_LABELING is ON.
   * Same boolean as hardBlocked (hardBlocks OR groupBlocks) — entry gate unchanged.
   */
  entryBlocked?: boolean;
};

/** Apply rename fields without changing the OR formula value. */
export function applyEntryBlockedFields(blocked: boolean): EntryBlockedFields {
  if (isFixHardReasonLabelingEnabled()) {
    return { entryBlocked: blocked, hardBlocked: blocked };
  }
  return { hardBlocked: blocked };
}

/** Read blocked flag — prefers entryBlocked when flag ON. */
export function resolveSnapEntryBlocked(snap: {
  hardBlocked?: boolean;
  entryBlocked?: boolean;
}): boolean {
  if (isFixHardReasonLabelingEnabled()) {
    if (typeof snap.entryBlocked === 'boolean') return snap.entryBlocked;
  }
  return snap.hardBlocked === true;
}
