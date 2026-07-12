/**
 * Entry State Manager — Transition Matrix (data only).
 *
 * **Purpose:** SSOT for transitions + audit metadata (Task 02.2.2.2).
 * **Used by:** Audit, Journal, Export, AI validation — future state machine reads only.
 * **Do not use in:** Runtime logic, module calls, or production integration.
 *
 * @module entryStateManager/transitionMatrix
 * @see Task 02.2.2.1 — Business Workflow
 * @see Task 02.2.2.2 — Transition metadata
 */

import { EntryState } from './enums';
import {
  TransitionAuditLabel,
  TransitionCategory,
  TRANSITION_CATEGORY_PRIORITY,
} from './transitionMetadata';
import type { EntryTransitionConstraint, EntryTransitionDefinition, EntryTransitionMetadataRow } from './transitionTypes';

/** Build canonical transition ID from from/to states. */
export function entryTransitionId(from: EntryState, to: EntryState): EntryTransitionDefinition['transitionId'] {
  return `ESM-T-${from}-${to}`;
}

/**
 * Full 4×4 grid — 12 allowed / 4 forbidden. Each row has complete audit metadata.
 */
export const ENTRY_TRANSITION_MATRIX: readonly EntryTransitionDefinition[] = [
  // ── READY ──────────────────────────────────────────────────────────
  {
    transitionId: entryTransitionId(EntryState.READY, EntryState.READY),
    fromState: EntryState.READY,
    toState: EntryState.READY,
    transitionReason: 'Conditions Still Valid',
    transitionCategory: TransitionCategory.Confirmation,
    priority: TRANSITION_CATEGORY_PRIORITY[TransitionCategory.Confirmation],
    sourceModule: 'EntryStateManager',
    auditLabel: TransitionAuditLabel.ENTRY_CONFIRM,
    ruleReference: '§1.1 / Business Workflow',
    allowed: true,
    description: 'Giữ READY khi điều kiện §1.1 vẫn đúng.',
    businessDescription: 'Ổn định trạng thái sẵn sàng giữa các scan.',
    futureConditionPlaceholder: 'PLACEHOLDER_READY_TO_READY',
  },
  {
    transitionId: entryTransitionId(EntryState.READY, EntryState.WATCH),
    fromState: EntryState.READY,
    toState: EntryState.WATCH,
    transitionReason: 'Momentum Weakened',
    transitionCategory: TransitionCategory.NoiseFilter,
    priority: TRANSITION_CATEGORY_PRIORITY[TransitionCategory.NoiseFilter],
    sourceModule: 'CVDFilter',
    auditLabel: TransitionAuditLabel.ENTRY_NOISE_FILTER,
    ruleReference: '§2.2 / Business Workflow',
    allowed: true,
    description: 'tradePlanValid false; score borderline; V4.1 EQ/momentum fail.',
    businessDescription: 'Hạ từ pipeline — quay về vùng xác nhận WATCH.',
    futureConditionPlaceholder: 'PLACEHOLDER_READY_TO_WATCH',
  },
  {
    transitionId: entryTransitionId(EntryState.READY, EntryState.LOCKED),
    fromState: EntryState.READY,
    toState: EntryState.LOCKED,
    transitionReason: 'Price Entered Lock Zone',
    transitionCategory: TransitionCategory.Confirmation,
    priority: TRANSITION_CATEGORY_PRIORITY[TransitionCategory.Confirmation],
    sourceModule: 'EntryStateManager',
    auditLabel: TransitionAuditLabel.ENTRY_LOCK,
    ruleReference: '§2.2 / Business Workflow',
    allowed: true,
    description: 'Giá ∈ Entry Lock Zone sau khi đã READY.',
    businessDescription: 'Pipeline READY → LOCKED → ENTRY.',
    futureConditionPlaceholder: 'PLACEHOLDER_READY_TO_LOCKED',
  },
  {
    transitionId: entryTransitionId(EntryState.READY, EntryState.BLOCKED),
    fromState: EntryState.READY,
    toState: EntryState.BLOCKED,
    transitionReason: 'Hard Block Activated',
    transitionCategory: TransitionCategory.HardBlock,
    priority: TRANSITION_CATEGORY_PRIORITY[TransitionCategory.HardBlock],
    sourceModule: 'RuleEngine',
    auditLabel: TransitionAuditLabel.ENTRY_BLOCK,
    ruleReference: '§2.2 / Business Workflow',
    allowed: true,
    description: 'Hard/Group block mới; ADX CHOPPY; ambiguity confirmed.',
    businessDescription: 'Chặn an toàn — thoát pipeline xuống BLOCKED.',
    futureConditionPlaceholder: 'PLACEHOLDER_READY_TO_BLOCKED',
  },

  // ── WATCH ──────────────────────────────────────────────────────────
  {
    transitionId: entryTransitionId(EntryState.WATCH, EntryState.WATCH),
    fromState: EntryState.WATCH,
    toState: EntryState.WATCH,
    transitionReason: 'Awaiting Confirmation',
    transitionCategory: TransitionCategory.NoiseFilter,
    priority: TRANSITION_CATEGORY_PRIORITY[TransitionCategory.NoiseFilter],
    sourceModule: 'EntryStateManager',
    auditLabel: TransitionAuditLabel.ENTRY_NOISE_FILTER,
    ruleReference: '§1.2 / Business Workflow',
    allowed: true,
    description: 'Giữ WATCH — vùng xác nhận / chống nhiễu.',
    businessDescription: 'Tiếp tục theo dõi và xác nhận setup.',
    futureConditionPlaceholder: 'PLACEHOLDER_WATCH_TO_WATCH',
  },
  {
    transitionId: entryTransitionId(EntryState.WATCH, EntryState.READY),
    fromState: EntryState.WATCH,
    toState: EntryState.READY,
    transitionReason: 'Conditions Confirmed',
    transitionCategory: TransitionCategory.Confirmation,
    priority: TRANSITION_CATEGORY_PRIORITY[TransitionCategory.Confirmation],
    sourceModule: 'EntryStateManager',
    auditLabel: TransitionAuditLabel.ENTRY_CONFIRM,
    ruleReference: '§2.2 / Business Workflow',
    allowed: true,
    description: 'Đủ canEnter + plan valid + hysteresis enter (§3) — task sau.',
    businessDescription: 'Xác nhận xong — pipeline WATCH → READY.',
    futureConditionPlaceholder: 'PLACEHOLDER_WATCH_TO_READY',
  },
  {
    transitionId: entryTransitionId(EntryState.WATCH, EntryState.LOCKED),
    fromState: EntryState.WATCH,
    toState: EntryState.LOCKED,
    transitionReason: 'Invalid Pipeline Skip',
    transitionCategory: TransitionCategory.Protection,
    priority: TRANSITION_CATEGORY_PRIORITY[TransitionCategory.Protection],
    sourceModule: 'EntryStateManager',
    auditLabel: TransitionAuditLabel.ENTRY_INVALID,
    ruleReference: 'Business Workflow 02.2.2.1',
    allowed: false,
    description: 'INVALID — nhảy cóc bỏ qua READY.',
    businessDescription: 'Luồng đúng: WATCH → READY → LOCKED.',
    futureConditionPlaceholder: 'PLACEHOLDER_INVALID_WATCH_TO_LOCKED',
  },
  {
    transitionId: entryTransitionId(EntryState.WATCH, EntryState.BLOCKED),
    fromState: EntryState.WATCH,
    toState: EntryState.BLOCKED,
    transitionReason: 'Hard Block Activated',
    transitionCategory: TransitionCategory.HardBlock,
    priority: TRANSITION_CATEGORY_PRIORITY[TransitionCategory.HardBlock],
    sourceModule: 'RuleEngine',
    auditLabel: TransitionAuditLabel.ENTRY_BLOCK,
    ruleReference: '§2.2 / Business Workflow',
    allowed: true,
    description: 'Hard block; score < ngưỡng; ambiguity 2-scan.',
    businessDescription: 'Chặn setup xấu từ vùng theo dõi.',
    futureConditionPlaceholder: 'PLACEHOLDER_WATCH_TO_BLOCKED',
  },

  // ── LOCKED ─────────────────────────────────────────────────────────
  {
    transitionId: entryTransitionId(EntryState.LOCKED, EntryState.LOCKED),
    fromState: EntryState.LOCKED,
    toState: EntryState.LOCKED,
    transitionReason: 'Maintaining Lock',
    transitionCategory: TransitionCategory.Confirmation,
    priority: TRANSITION_CATEGORY_PRIORITY[TransitionCategory.Confirmation],
    sourceModule: 'EntryStateManager',
    auditLabel: TransitionAuditLabel.ENTRY_LOCK,
    ruleReference: '§1.3 / Business Workflow',
    allowed: true,
    description: 'Giữ LOCKED trong entry lock zone.',
    businessDescription: 'Duy trì cam kết setup trước ENTRY.',
    futureConditionPlaceholder: 'PLACEHOLDER_LOCKED_TO_LOCKED',
  },
  {
    transitionId: entryTransitionId(EntryState.LOCKED, EntryState.BLOCKED),
    fromState: EntryState.LOCKED,
    toState: EntryState.BLOCKED,
    transitionReason: 'Critical Risk Cancel',
    transitionCategory: TransitionCategory.Protection,
    priority: TRANSITION_CATEGORY_PRIORITY[TransitionCategory.Protection],
    sourceModule: 'RiskEngine',
    auditLabel: TransitionAuditLabel.ENTRY_BLOCK,
    ruleReference: '§2.2 / Business Workflow',
    allowed: true,
    description: 'Cancel reason critical (SL, BTC, CVD, funding, health).',
    businessDescription: 'Rủi ro thật — thoát lock xuống BLOCKED.',
    futureConditionPlaceholder: 'PLACEHOLDER_LOCKED_TO_BLOCKED',
  },
  {
    transitionId: entryTransitionId(EntryState.LOCKED, EntryState.READY),
    fromState: EntryState.LOCKED,
    toState: EntryState.READY,
    transitionReason: 'Invalid Skip-WATCH Recovery',
    transitionCategory: TransitionCategory.Protection,
    priority: TRANSITION_CATEGORY_PRIORITY[TransitionCategory.Protection],
    sourceModule: 'EntryStateManager',
    auditLabel: TransitionAuditLabel.ENTRY_INVALID,
    ruleReference: 'Business Workflow 02.2.2.1',
    allowed: false,
    description: 'INVALID — recovery bỏ qua WATCH.',
    businessDescription: 'Luồng: LOCKED → WATCH → READY.',
    futureConditionPlaceholder: 'PLACEHOLDER_INVALID_LOCKED_TO_READY',
  },
  {
    transitionId: entryTransitionId(EntryState.LOCKED, EntryState.WATCH),
    fromState: EntryState.LOCKED,
    toState: EntryState.WATCH,
    transitionReason: 'Price Left Lock Zone',
    transitionCategory: TransitionCategory.Unlock,
    priority: TRANSITION_CATEGORY_PRIORITY[TransitionCategory.Unlock],
    sourceModule: 'EntryStateManager',
    auditLabel: TransitionAuditLabel.ENTRY_UNLOCK,
    ruleReference: '§2.2 / Business Workflow',
    allowed: true,
    description: 'Unlock không critical; giá ra khỏi lock zone.',
    businessDescription: 'Recovery pipeline — LOCKED → WATCH.',
    futureConditionPlaceholder: 'PLACEHOLDER_LOCKED_TO_WATCH',
  },

  // ── BLOCKED ────────────────────────────────────────────────────────
  {
    transitionId: entryTransitionId(EntryState.BLOCKED, EntryState.BLOCKED),
    fromState: EntryState.BLOCKED,
    toState: EntryState.BLOCKED,
    transitionReason: 'Block Still Active',
    transitionCategory: TransitionCategory.HardBlock,
    priority: TRANSITION_CATEGORY_PRIORITY[TransitionCategory.HardBlock],
    sourceModule: 'RuleEngine',
    auditLabel: TransitionAuditLabel.ENTRY_BLOCK,
    ruleReference: '§1.4 / Business Workflow',
    allowed: true,
    description: 'Giữ BLOCKED khi block còn hiệu lực.',
    businessDescription: 'Duy trì cấm vào lệnh.',
    futureConditionPlaceholder: 'PLACEHOLDER_BLOCKED_TO_BLOCKED',
  },
  {
    transitionId: entryTransitionId(EntryState.BLOCKED, EntryState.WATCH),
    fromState: EntryState.BLOCKED,
    toState: EntryState.WATCH,
    transitionReason: 'Hard Block Cleared',
    transitionCategory: TransitionCategory.Recovery,
    priority: TRANSITION_CATEGORY_PRIORITY[TransitionCategory.Recovery],
    sourceModule: 'RuleEngine',
    auditLabel: TransitionAuditLabel.ENTRY_RECOVERY,
    ruleReference: '§2.2 / Business Workflow',
    allowed: true,
    description: 'Hard block hết; còn soft (plan/score).',
    businessDescription: 'Recovery bắt buộc — BLOCKED → WATCH.',
    futureConditionPlaceholder: 'PLACEHOLDER_BLOCKED_TO_WATCH',
  },
  {
    transitionId: entryTransitionId(EntryState.BLOCKED, EntryState.READY),
    fromState: EntryState.BLOCKED,
    toState: EntryState.READY,
    transitionReason: 'Invalid Skip-WATCH Recovery',
    transitionCategory: TransitionCategory.Protection,
    priority: TRANSITION_CATEGORY_PRIORITY[TransitionCategory.Protection],
    sourceModule: 'EntryStateManager',
    auditLabel: TransitionAuditLabel.ENTRY_INVALID,
    ruleReference: 'Business Workflow 02.2.2.1',
    allowed: false,
    description: 'INVALID — recovery bỏ qua WATCH.',
    businessDescription: 'Luồng: BLOCKED → WATCH → READY.',
    futureConditionPlaceholder: 'PLACEHOLDER_INVALID_BLOCKED_TO_READY',
  },
  {
    transitionId: entryTransitionId(EntryState.BLOCKED, EntryState.LOCKED),
    fromState: EntryState.BLOCKED,
    toState: EntryState.LOCKED,
    transitionReason: 'Invalid Pipeline Skip',
    transitionCategory: TransitionCategory.Protection,
    priority: TRANSITION_CATEGORY_PRIORITY[TransitionCategory.Protection],
    sourceModule: 'EntryStateManager',
    auditLabel: TransitionAuditLabel.ENTRY_INVALID,
    ruleReference: 'Business Workflow 02.2.2.1',
    allowed: false,
    description: 'INVALID — nhảy cóc bỏ qua WATCH và READY.',
    businessDescription: 'Luồng: BLOCKED → WATCH → READY → LOCKED.',
    futureConditionPlaceholder: 'PLACEHOLDER_INVALID_BLOCKED_TO_LOCKED',
  },
] as const;

/** Audit / export table — projection of matrix metadata columns. */
export const ENTRY_TRANSITION_METADATA_TABLE: readonly EntryTransitionMetadataRow[] =
  ENTRY_TRANSITION_MATRIX.map((t) => ({
    transitionId: t.transitionId,
    fromState: t.fromState,
    toState: t.toState,
    allowed: t.allowed,
    transitionReason: t.transitionReason,
    transitionCategory: t.transitionCategory,
    priority: t.priority,
    sourceModule: t.sourceModule,
    auditLabel: t.auditLabel,
    ruleReference: t.ruleReference,
  }));

export const ENTRY_TRANSITION_LOOKUP: Readonly<Record<string, EntryTransitionDefinition>> =
  Object.fromEntries(
    ENTRY_TRANSITION_MATRIX.map((t) => [`${t.fromState}→${t.toState}`, t]),
  );

export const ENTRY_FORBIDDEN_TRANSITIONS: readonly EntryTransitionDefinition[] =
  ENTRY_TRANSITION_MATRIX.filter((t) => !t.allowed);

export const ENTRY_TRANSITION_CONSTRAINTS: readonly EntryTransitionConstraint[] = [
  {
    id: 'CONSTRAINT-001',
    appliesTo: [entryTransitionId(EntryState.READY, EntryState.BLOCKED)],
    ruleReference: '§2.3.1',
    description:
      'Không READY → BLOCKED trong cùng 1 scan nếu hysteresis active.',
    futureConditionPlaceholder: 'PLACEHOLDER_CONSTRAINT_HYSTERESIS_READY_BLOCKED',
  },
  {
    id: 'CONSTRAINT-002',
    appliesTo: [entryTransitionId(EntryState.LOCKED, EntryState.WATCH)],
    ruleReference: '§2.3.2',
    description: 'Không LOCKED → WATCH chỉ vì 1 lần RSI/MACD dao động.',
    futureConditionPlaceholder: 'PLACEHOLDER_CONSTRAINT_LOCKED_WATCH_NOISE',
  },
  {
    id: 'CONSTRAINT-004',
    appliesTo: [entryTransitionId(EntryState.READY, EntryState.LOCKED)],
    ruleReference: '§2.3.4',
    description: 'Không READY → LOCKED khi AMBIGUOUS.',
    futureConditionPlaceholder: 'PLACEHOLDER_CONSTRAINT_NO_LOCK_AMBIGUOUS',
  },
  {
    id: 'CONSTRAINT-005',
    appliesTo: [entryTransitionId(EntryState.WATCH, EntryState.READY)],
    ruleReference: '§1.2',
    description: 'Không WATCH → READY ngay 1 scan sau nhiễu từ READY.',
    futureConditionPlaceholder: 'PLACEHOLDER_CONSTRAINT_WATCH_READY_NOISE',
  },
] as const;

export const ENTRY_ALLOWED_TRANSITIONS: readonly EntryTransitionDefinition[] =
  ENTRY_TRANSITION_MATRIX.filter((t) => t.allowed);

export const ENTRY_SKIP_WATCH_FORBIDDEN_PAIRS: readonly Readonly<[EntryState, EntryState]>[] = [
  [EntryState.WATCH, EntryState.LOCKED],
  [EntryState.LOCKED, EntryState.READY],
  [EntryState.BLOCKED, EntryState.READY],
  [EntryState.BLOCKED, EntryState.LOCKED],
] as const;
