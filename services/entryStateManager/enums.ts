/**
 * Entry State Manager — domain enums.
 *
 * **Purpose:** Canonical ESM state and audit enumerations per RuleBook V2.
 * **Used by:** `EntryStateSnapshot`, audit export, future state machine (Task 02.2+).
 * **Do not use in:** Replacing `FinalEntryStatus` in production until integration task.
 *
 * @module entryStateManager/enums
 * @see RuleBook V2.0.0 (LOCKED) — §1, §4, §6, §7
 */

/**
 * Primary ESM states — RuleBook §1 (approved set only).
 *
 * **Single Source of Truth** for entry lifecycle state IDs.
 * Exactly four values: READY, WATCH, LOCKED, BLOCKED — no extensions.
 *
 * **Used by:** `ENTRY_STATE_DEFINITIONS`, `EntryStateSnapshot`, audit export.
 * **Do not use in:** Score thresholds, `FinalEntryStatus`, or journal status enums.
 *
 * @see {@link ENTRY_STATE_DEFINITIONS} for per-state metadata.
 */
export enum EntryState {
  /**
   * **READY** — Sẵn sàng vào lệnh (RuleBook §1.1).
   *
   * **When to use:** All §1.1 entry conditions met after Rule Engine.
   * **When not to use:** Any block, invalid plan, lock zone active, or journal order flow.
   *
   * **Read:** Entry Engine, Journal, Export, UI (future integration).
   * **Write:** EntryStateManager only — not Score/Rule Engine.
   */
  READY = 'READY',

  /**
   * **WATCH** — Theo dõi (RuleBook §1.2).
   *
   * **When to use:** Notable setup; one of groups A–E §1.2 applies.
   * **When not to use:** Ready for entry, hard blocked, or in lock zone.
   *
   * **Read:** Entry Engine, Export, UI (future).
   * **Write:** EntryStateManager only.
   */
  WATCH = 'WATCH',

  /**
   * **LOCKED** — Khóa trạng thái (RuleBook §1.3).
   *
   * **When to use:** Price in Entry Lock Zone from READY/WATCH; direction clear.
   * **When not to use:** AMBIGUOUS, Critical/High hard block, noise-only unlock.
   *
   * **Read:** Locked plan monitor, Journal, Export, UI (future).
   * **Write:** EntryStateManager only — not `lockedPlanScoring` directly.
   */
  LOCKED = 'LOCKED',

  /**
   * **BLOCKED** — Không được vào lệnh (RuleBook §1.4).
   *
   * **When to use:** Hard/group/score block, confirmed ambiguity, V4.1 BLOCK.
   * **When not to use:** Soft-only conditions (prefer WATCH); open position management.
   *
   * **Read:** Entry Engine, Export, UI (future).
   * **Write:** EntryStateManager only — not `calculateFinalEntryStatus`.
   */
  BLOCKED = 'BLOCKED',
}

/**
 * Lock sub-status for audit and journal correlation — RuleBook §7.1.
 *
 * **Used by:** `EntryStateAuditFields.lock_status`, LockedTradePlan sync (future).
 * **Do not use in:** Replacing `LockedTradePlan.status` in V1.0.5 journal.
 */
export enum LockStatus {
  /** Không trong entry lock zone / chưa khóa setup. */
  UNLOCKED = 'UNLOCKED',
  /** Giá trong entry lock zone; frozen layers active (§4.2). */
  LOCKED = 'LOCKED',
  /** Limit order placed; chờ fill (journal PENDING). */
  PENDING_FILL = 'PENDING_FILL',
}

/**
 * Hard-block taxonomy tier for ESM priority map — RuleBook §6.
 *
 * **Used by:** `hard_block_priority` audit field, BLOCKED reason classification.
 * **Do not use in:** Changing V1.0.5 `hardBlocks[]` evaluation logic.
 */
export enum HardBlockPriority {
  /** Chặn ngay; hủy LOCKED nếu đang lock (§6.1). */
  CRITICAL = 'CRITICAL',
  /** Chặn vào lệnh; hủy LOCKED (§6.2). */
  HIGH = 'HIGH',
  /** Chặn canEnter; có thể chỉ WATCH khi thoát dần (§6.3). */
  MEDIUM = 'MEDIUM',
  /** Cảnh báo / soft; không hard block array (§6.4). */
  LOW = 'LOW',
}

/**
 * Trade direction key for per-(symbol, direction) ESM state — RuleBook §7.2.
 *
 * **Used by:** `EntryStateRecord`, `EntryStateManagerInput`.
 * **Do not use in:** Replacing `TradeDirection` in scorer without mapping layer.
 */
export enum EsmDirection {
  LONG = 'LONG',
  SHORT = 'SHORT',
}

/**
 * Entry lock zone geometry mode — RuleBook §4.1.
 *
 * **Used by:** `LockZoneConfig`, lock bounds computation (Task 02.4).
 * **Do not use in:** Trade plan entry zone type (`entryZoneType` in journal).
 */
export enum LockZoneMode {
  /** Lock bounds = optimalEntry ± percent. */
  PERCENT = 'PERCENT',
  /** Lock bounds derived from ATR multiplier. */
  ATR = 'ATR',
}

/**
 * Scorer lineage label for ESM audit — RuleBook §7.2.
 *
 * **Used by:** `EntryStateAuditSupplement.scorer_version`, input context.
 * **Do not use in:** Replacing app-wide `ScorerVersion` enum without adapter.
 */
export enum EsmScorerVersion {
  V3 = 'v3',
  V4 = 'v4',
  V41 = 'v41',
  UNIFIED = 'unified',
}
