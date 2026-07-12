/**
 * Entry State definitions and metadata — RuleBook V2 §1.
 *
 * **Purpose:** Single Source of Truth for ESM {@link EntryState} descriptions.
 * **Used by:** UI labels (future), audit docs, state machine (Task 02.2+).
 * **Do not use in:** Transition evaluation, hysteresis, or production scan path.
 *
 * @module entryStateManager/entryStateMetadata
 * @see RuleBook V2.0.0 (LOCKED) — §1, §9.2
 */

import { EntryState } from './enums';

/**
 * Descriptive metadata for one {@link EntryState} — no algorithms.
 *
 * `allowsEntry` and `allowsTransition` are **documentation flags** only;
 * enforcement is a later task.
 */
export interface EntryStateDefinition {
  /** Canonical state ID — must match {@link EntryState} enum value. */
  id: EntryState;
  /** Human-readable label for UI and export. */
  displayName: string;
  /** Short technical description. */
  description: string;
  /** Business meaning per RuleBook §1.x. */
  businessMeaning: string;
  /**
   * Whether the state ends the ESM lifecycle without further transitions.
   * RuleBook §2: all four states participate in transitions → all `false`.
   */
  isTerminal: boolean;
  /**
   * Whether discretionary new entry is permitted in this state (§1).
   * LOCKED uses journal/limit flow — not discretionary `canEnter`.
   */
  allowsEntry: boolean;
  /**
   * Whether this state may appear as source/target in transition matrix (§2).
   * All RuleBook states allow transitions (including self-loop).
   */
  allowsTransition: boolean;
  /** When this state should be assigned — descriptive only. */
  whenToUse: string;
  /** When this state must not be assigned — descriptive only. */
  whenNotToUse: string;
  /** Modules permitted to **read** this state (RuleBook §8, §9.2). */
  readModules: readonly string[];
  /** Modules permitted to **write** / assign this state — ESM only until integration. */
  writeModules: readonly string[];
}

/**
 * Exhaustive list of approved ESM states — RuleBook §1 only.
 *
 * **Do not extend** with WAITING, HOLD, PAUSE, UNKNOWN, IDLE, or other values.
 */
export const ENTRY_STATE_IDS: readonly EntryState[] = [
  EntryState.READY,
  EntryState.WATCH,
  EntryState.LOCKED,
  EntryState.BLOCKED,
] as const;

/**
 * Canonical metadata map — one entry per {@link EntryState}.
 * Single Source of Truth for state documentation.
 */
export const ENTRY_STATE_DEFINITIONS: Readonly<Record<EntryState, EntryStateDefinition>> = {
  [EntryState.READY]: {
    id: EntryState.READY,
    displayName: 'Sẵn sàng vào lệnh',
    description: 'Setup đạt ngưỡng; plan hợp lệ; không hard/group/score block.',
    businessMeaning:
      'User được phép mở lệnh theo hướng đã chọn. Tương đương FinalEntryStatus.ENTRY_VALID (§1.1).',
    isTerminal: false,
    allowsEntry: true,
    allowsTransition: true,
    whenToUse:
      'Sau Rule Engine khi tất cả điều kiện §1.1 đúng: không block, plan valid, ADX ok, hướng rõ, không awaitingRescore.',
    whenNotToUse:
      'Khi hard/group/score block active; plan invalid; ambiguity confirmed; giá đã trong entry lock zone (→ LOCKED); hoặc thay thế journal PENDING/OPEN.',
    readModules: [
      'EntryStateManager (writer)',
      'Entry Engine (reader — future)',
      'Trade Journal (reader — future)',
      'Export / Audit (reader — future)',
      'UI Signal Board (reader — future)',
    ],
    writeModules: ['EntryStateManager (future state machine only)'],
  },

  [EntryState.WATCH]: {
    id: EntryState.WATCH,
    displayName: 'Theo dõi',
    description: 'Setup đáng chú ý nhưng chưa đủ điều kiện vào lệnh ngay.',
    businessMeaning:
      'Chờ giá/plan, borderline score, V4.1 WATCH_MODE, unified WATCH/MEDIUM, hoặc hướng sắp rõ (§1.2).',
    isTerminal: false,
    allowsEntry: false,
    allowsTransition: true,
    whenToUse:
      'Một trong nhóm A–E §1.2: plan/R:R chưa sẵn, CHO_THEM/CÓ THỂ VÀO chưa đủ canEnter, V4.1 watch, unified observe, ambiguity count = 1.',
    whenNotToUse:
      'Khi đủ điều kiện READY; khi hard block → BLOCKED; khi giá trong lock zone → LOCKED; không dùng cho lệnh đang OPEN trong journal.',
    readModules: [
      'EntryStateManager (writer)',
      'Entry Engine (reader — future)',
      'Export / Audit (reader — future)',
      'UI Signal Board (reader — future)',
    ],
    writeModules: ['EntryStateManager (future state machine only)'],
  },

  [EntryState.LOCKED]: {
    id: EntryState.LOCKED,
    displayName: 'Khóa trạng thái',
    description: 'Setup đã cam kết; score cốt lõi đóng băng; live-rescore layer phụ.',
    businessMeaning:
      'Tránh đổi ý khi giá sát entry. Map LockedTradePlan WAITING; frozen L1/L3/L4 (§1.3, §4.2).',
    isTerminal: false,
    allowsEntry: false,
    allowsTransition: true,
    whenToUse:
      'Từ READY/WATCH khi giá ∈ Entry Lock Zone, không Critical/High hard block, hướng LONG/SHORT rõ (§1.3).',
    whenNotToUse:
      'Khi AMBIGUOUS; khi Critical/High hard block; không gán vì 1 scan MACD/RSI nhiễu; không thay thế journal status TRIGGERED/FILLED.',
    readModules: [
      'EntryStateManager (writer)',
      'Locked plan monitor (reader — future)',
      'Trade Journal (reader — future)',
      'Export / Audit (reader — future)',
      'UI Signal Board (reader — future)',
    ],
    writeModules: ['EntryStateManager (future state machine only)'],
  },

  [EntryState.BLOCKED]: {
    id: EntryState.BLOCKED,
    displayName: 'Không được vào lệnh',
    description: 'Cấm mở lệnh mới theo hướng setup; UI hiển thị lý do block.',
    businessMeaning:
      'Hard/group/score block, ambiguity 2-scan, V4.1 early warning BLOCK (§1.4). Map HARD/GROUP/SCORE_BLOCKED.',
    isTerminal: false,
    allowsEntry: false,
    allowsTransition: true,
    whenToUse:
      'Ưu tiên §1.4: hardBlocks hoặc ADX CHOPPY; groupBlocks; decision KHONG_VAO/CHO_THEM/CHO_TAI_CHAM; ambiguity confirmed; V4.1 BLOCK severity.',
    whenNotToUse:
      'Khi chỉ soft warning (→ WATCH); khi hardBlocks rỗng và canEnter true (→ READY/WATCH); không dùng cho Position Adviser exit states.',
    readModules: [
      'EntryStateManager (writer)',
      'Entry Engine (reader — future)',
      'Export / Audit (reader — future)',
      'UI Signal Board (reader — future)',
    ],
    writeModules: ['EntryStateManager (future state machine only)'],
  },
};

/** Type guard — true if value is a RuleBook-approved {@link EntryState}. */
export function isEntryState(value: string): value is EntryState {
  return (ENTRY_STATE_IDS as readonly string[]).includes(value);
}
