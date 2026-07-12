/**
 * ESM snapshot delta comparison — store write optimization (UL-04.1).
 *
 * **Purpose:** Skip store writes when material snapshot fields are unchanged.
 *
 * @module store/esmSnapshotDelta
 */

import type { ProductionEsmBridgeSnapshot } from '../services/productionEsmBridge/productionEsmBridgeTypes';
import { resolveEsmRuleBookHint } from '../utils/esmUiDisplay';

/** Material fields compared before persisting a new snapshot. */
export interface EsmSnapshotDeltaComparable {
  readonly hintCode: string | null;
  readonly currentState: string;
  readonly blockReasons: readonly string[];
  readonly message: string;
}

function resolveSnapshotCurrentState(snapshot: ProductionEsmBridgeSnapshot): string {
  const sm = snapshot.harnessResult?.pipelineResult.stateMachineResult;
  const candidate = sm?.nextState ?? sm?.currentState ?? snapshot.mappedCurrentState;
  return candidate != null ? String(candidate) : String(snapshot.mappedCurrentState);
}

function resolveSnapshotBlockReasons(snapshot: ProductionEsmBridgeSnapshot): readonly string[] {
  const hardBlock = snapshot.harnessResult?.context.triggerSnapshot.hardBlockResult;
  return [...(hardBlock?.context.normalizedRuleOutput.blockReasons ?? [])];
}

/** Extracts comparable material fields — presentation read only, no evaluation. */
export function extractEsmSnapshotDeltaComparable(
  snapshot: ProductionEsmBridgeSnapshot,
): EsmSnapshotDeltaComparable {
  return {
    hintCode: resolveEsmRuleBookHint(snapshot, snapshot.symbol),
    currentState: resolveSnapshotCurrentState(snapshot),
    blockReasons: resolveSnapshotBlockReasons(snapshot),
    message: snapshot.message,
  };
}

function comparableEqual(
  left: EsmSnapshotDeltaComparable,
  right: EsmSnapshotDeltaComparable,
): boolean {
  if (left.hintCode !== right.hintCode) return false;
  if (left.currentState !== right.currentState) return false;
  if (left.message !== right.message) return false;
  if (left.blockReasons.length !== right.blockReasons.length) return false;
  for (let i = 0; i < left.blockReasons.length; i++) {
    if (left.blockReasons[i] !== right.blockReasons[i]) return false;
  }
  return true;
}

/** True when material fields match — safe to skip store write. */
export function areEsmSnapshotsMateriallyEqual(
  previous: ProductionEsmBridgeSnapshot,
  next: ProductionEsmBridgeSnapshot,
): boolean {
  return comparableEqual(
    extractEsmSnapshotDeltaComparable(previous),
    extractEsmSnapshotDeltaComparable(next),
  );
}
