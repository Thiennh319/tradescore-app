/**
 * HardBlock originRuleId resolution — RuleBook §6 taxonomy lookup only (Task 02.4.3).
 *
 * **Passthrough mapping:** message prefix → existing `HB-*` ID.
 * **Does NOT** evaluate rules or create new IDs.
 *
 * Unmapped messages → `null` (documented in Task 02.4.3 report).
 *
 * @module entryStateManager/hardBlockOriginRuleId
 */

import type { HardBlockTaxonomyId } from './hardBlockIds';
import { isValidOriginRuleId } from './originRuleIdValidation';

/** Prefix / substring → RuleBook taxonomy ID (§6.1–6.4). */
const HARD_BLOCK_MESSAGE_ORIGIN_MAP: readonly {
  readonly match: (message: string) => boolean;
  readonly originRuleId: HardBlockTaxonomyId;
}[] = [
  { match: (m) => m.startsWith('L3 MACD'), originRuleId: 'HB-HIGH-05' },
  {
    match: (m) => m === 'CVD deeply negative and still deteriorating.',
    originRuleId: 'HB-HIGH-01',
  },
  { match: (m) => m.startsWith('CVD +') && m.includes('> +2M'), originRuleId: 'HB-HIGH-02' },
  { match: (m) => m.startsWith('Funding '), originRuleId: 'HB-HIGH-04' },
  {
    match: (m) => m.includes('quá rủi ro') || m.includes('BTC biến động'),
    originRuleId: 'HB-CRIT-03',
  },
  {
    match: (m) => m.includes('≤ -2%') || m.includes('≥ +2%'),
    originRuleId: 'HB-HIGH-03',
  },
  { match: (m) => m.startsWith('L9 Phiên xấu'), originRuleId: 'HB-MED-02' },
  {
    match: (m) => m.startsWith('L10') || m === 'L10 Tâm lý chưa sẵn sàng',
    originRuleId: 'HB-MED-03',
  },
  { match: (m) => m.startsWith('Nhóm '), originRuleId: 'HB-MED-01' },
  { match: (m) => m.startsWith('L5a'), originRuleId: 'HB-LOW-01' },
];

/** Fixed taxonomy IDs for flag-based evidence (RuleBook §6). */
export const HARDBLOCK_FLAG_ORIGIN_IDS = {
  adxGateBlocked: 'HB-CRIT-01' as const satisfies HardBlockTaxonomyId,
  groupBlock: 'HB-MED-01' as const satisfies HardBlockTaxonomyId,
  blockReasonL5a: 'HB-LOW-01' as const satisfies HardBlockTaxonomyId,
} as const;

/**
 * Resolve `originRuleId` from an existing hard-block message string.
 *
 * Returns `null` when no RuleBook taxonomy match (e.g. trade plan invalid — no HB ID).
 */
export function resolveHardBlockOriginRuleId(message: string): HardBlockTaxonomyId | null {
  const trimmed = message.trim();
  if (!trimmed) return null;
  for (const entry of HARD_BLOCK_MESSAGE_ORIGIN_MAP) {
    if (entry.match(trimmed)) return entry.originRuleId;
  }
  return null;
}

/** Validate originRuleId is known taxonomy or null. */
export function isValidHardBlockOriginRuleId(id: string | null | undefined): boolean {
  return isValidOriginRuleId(id, 'HB');
}
