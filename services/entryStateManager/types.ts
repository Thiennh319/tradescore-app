/**
 * Entry State Manager — types and interfaces.
 *
 * **Purpose:** Data contracts for ESM input, output, persistence, and config.
 * **Used by:** Future state machine, store bridge, export package (Task 02.2+).
 * **Do not use in:** Storing live scores or recomputing indicators (RuleBook §9.3).
 *
 * @module entryStateManager/types
 * @see RuleBook V2.0.0 (LOCKED) — §3–§5, §7, §9
 */

import type {
  EntryState,
  EsmDirection,
  EsmScorerVersion,
  HardBlockPriority,
  LockStatus,
  LockZoneMode,
} from './enums';

/**
 * Hysteresis scan-count parameters — RuleBook §3.2.
 *
 * **Used by:** `EntryStateRecord`, audit `hysteresis_config`.
 * **Do not use in:** `directionAmbiguity.ts` — separate until integration.
 */
export interface HysteresisConfig {
  /** Scans liên tiếp đủ READY trước WATCH→READY (§3.2). */
  enterReadyScans: number;
  /** Scans liên tiếp fail trước READY→WATCH (§3.2). */
  exitReadyScans: number;
  /** Scans vào BLOCKED — default 1 = instant on hard block (§3.4). */
  enterBlockedScans: number;
  /** Scans thoát BLOCKED sau hard block hết (§3.4). */
  exitBlockedScans: number;
  /** Scans vào AMBIGUOUS-equivalent gate (§3.2). */
  ambiguityEnterScans: number;
  /** Scans thoát ambiguity (§3.2). */
  ambiguityExitScans: number;
}

/**
 * Entry lock zone parameters — RuleBook §4.1.
 *
 * **Used by:** Lock evaluator (Task 02.4), audit supplement.
 * **Do not use in:** `calculateOptimalEntry` or capital rules directly.
 */
export interface LockZoneConfig {
  mode: LockZoneMode;
  /** Fraction of price, e.g. 0.005 = 0.5%. */
  percent: number;
  atrMultiplier: number;
  /** Skip lock when price farther than this fraction from optimal; null = no min gate. */
  minDistancePercent: number | null;
}

/**
 * Computed lock bounds around optimal entry — RuleBook §4.1, §7.2.
 *
 * **Used by:** Audit `lock_zone_bounds`, lock zone UI (future).
 * **Do not use in:** SL/TP geometry (`tradePlanV3/V4`).
 */
export interface EntryLockZoneBounds {
  optimal: number;
  low: number;
  high: number;
}

/**
 * Per-symbol hysteresis counters — RuleBook §3.5 (storage shape only).
 *
 * **Used by:** `EntryStateRecord` persistence (Task 02.3).
 * **Do not use in:** `directionAmbiguity` state ref — merge in integration task.
 */
export interface HysteresisCounters {
  consecutiveReadyCount: number;
  consecutiveWatchCount: number;
  consecutiveBlockedCount: number;
  consecutiveClearDirectionCount: number;
}

/**
 * Human-readable transition label for audit — RuleBook §7.1.
 *
 * **Used by:** `EntryStateSnapshot.transition`, export SECTION: ENTRY STATE.
 * **Do not use in:** Parsing state machine input — use {@link EntryState} enum.
 */
export type EntryStateTransitionLabel = `${EntryState} → ${EntryState}`;

/**
 * Single source of truth per (symbol, direction) per scan — RuleBook §9.2.
 *
 * **Used by:** UI read model, export, journal correlation (Task 02.5+).
 * **Do not use in:** Overwriting `officialTotalScore` or `canEnter` at scaffold stage.
 */
export interface EntryStateSnapshot {
  symbol: string;
  direction: EsmDirection;
  entryState: EntryState;
  previousState: EntryState | null;
  transition: EntryStateTransitionLabel | null;
  transitionReason: string | null;
  lockStatus: LockStatus;
  lockReason: string | null;
  /** Metadata 0–100 only; never gates entry (§5). */
  commitScore: number | null;
  hardBlockPriority: HardBlockPriority | null;
  consecutiveScanCount: number;
  /** ISO8601 scan timestamp. */
  timestamp: string;
  scanId?: string;
}

/**
 * Persisted ESM record — counters + snapshot + config snapshot.
 *
 * **Used by:** ESM store / metadata layer (Task 02.3).
 * **Do not use in:** `useTradeStore` or journal entries until bridge task.
 */
export interface EntryStateRecord {
  symbol: string;
  direction: EsmDirection;
  snapshot: EntryStateSnapshot | null;
  counters: HysteresisCounters;
  hysteresisConfig: HysteresisConfig;
  lockZoneConfig: LockZoneConfig;
  lockZoneBounds: EntryLockZoneBounds | null;
  updatedAt: string;
}

/**
 * Read-only Rule Engine output ESM will consume — RuleBook §8.1, §9.3.
 *
 * **Used by:** State machine input adapter (Task 02.2).
 * **Do not use in:** Triggering rescans or calling scorer functions.
 */
export interface EntryStateManagerInput {
  symbol: string;
  direction: EsmDirection;
  markPrice: number;
  scorerVersion: EsmScorerVersion;
  hardBlocks: readonly string[];
  groupBlocks: readonly string[];
  blockReasons: readonly string[];
  tradePlanValid: boolean;
  adxGateBlocked: boolean;
  isAmbiguousDirection: boolean;
  awaitingRescore: boolean;
  /** Loose string at scaffold; narrow at integration. */
  decision: string;
  canEnter: boolean;
  /** Entry score — not commit score (§5.2). */
  entryScore: number | null;
  optimalEntry: number | null;
  scanTimestamp: string;
}

/**
 * Module configuration bundle — RuleBook §3.1, §4.1, §9.5.
 *
 * **Used by:** ESM bootstrap, feature-flag guard ({@link FEATURE_FLAG}).
 * **Do not use in:** App settings UI until settings task.
 */
export interface EntryStateManagerConfig {
  enabled: boolean;
  hysteresis: HysteresisConfig;
  lockZone: LockZoneConfig;
  rulebookVersion: string;
  auditVersion: string;
}
