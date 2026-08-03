/**
 * SignalRow scan context — read-only field copy for UL Review explanation (bridge output only).
 *
 * **Purpose:** Expose per-trade scorer data at bridge time without mutating SignalRow or ESM logic.
 * **Does NOT:** Run scoring, modify Trade Engine, or persist to journal.
 *
 * @module productionEsmBridge/signalRowScanContext
 */

import type { LayerResult, TradeDirection } from '../../constants/scoring';
import type { FinalEntryStatus } from '../../types/scoring';
import type { SignalRow } from '../signalBoardScan';

/** Read-only scan fields copied from production SignalRow at bridge time. */
export interface ProductionEsmScanContext {
  readonly direction: TradeDirection;
  readonly score: number;
  readonly longScore: number;
  readonly shortScore: number;
  readonly decisionLabel: string;
  readonly decisionDisplay: string;
  readonly canEnter: boolean;
  readonly hardBlocked: boolean;
  readonly regimeConfidence: number;
  readonly winrate: string;
  readonly layers: readonly LayerResult[];
  readonly mandatoryViolations: readonly string[];
  readonly groupBlocks: readonly string[];
  readonly hardBlocks: readonly string[];
  readonly blockReasons: readonly string[];
  readonly warnings: readonly string[];
  readonly scoringWarnings: readonly string[];
  readonly squeezeWarning: string | null;
  readonly adxBlockReason: string | undefined;
  readonly ambiguousMessage: string | undefined;
  readonly finalEntryStatus: FinalEntryStatus | undefined;
}

function resolveScorerSnapshot(row: SignalRow) {
  return row.v4 ?? row.v3;
}

function pickDirectional<T>(
  direction: TradeDirection,
  longValues: readonly T[] | undefined,
  shortValues: readonly T[] | undefined,
  fallback: readonly T[] | undefined,
): readonly T[] {
  const directional = direction === 'LONG' ? longValues : shortValues;
  if (directional && directional.length > 0) return [...directional];
  if (fallback && fallback.length > 0) return [...fallback];
  return [];
}

/**
 * Copies read-only scan context from SignalRow for UL Review UI.
 *
 * When `tradeDirection` is provided (e.g. open journal entry), direction-specific
 * layers/blocks/warnings are resolved for that side.
 */
export function extractScanContextFromSignalRow(
  row: SignalRow,
  tradeDirection?: TradeDirection,
): ProductionEsmScanContext {
  const snapshot = resolveScorerSnapshot(row);
  const direction =
    tradeDirection ?? snapshot?.direction ?? row.direction;

  const layers = pickDirectional(
    direction,
    snapshot?.longLayers,
    snapshot?.shortLayers,
    snapshot?.layers ?? row.layers,
  );

  return {
    direction,
    score: snapshot?.score ?? row.score,
    longScore: snapshot?.longScore ?? row.longScore,
    shortScore: snapshot?.shortScore ?? row.shortScore,
    decisionLabel: snapshot?.decisionLabel ?? row.decisionLabel,
    decisionDisplay: snapshot?.decisionDisplay ?? row.decisionDisplay,
    canEnter: snapshot?.canEnter ?? row.canEnter,
    hardBlocked: snapshot?.hardBlocked ?? row.hardBlocked,
    regimeConfidence: row.regimeConfidence,
    winrate: snapshot?.winrate ?? row.winrate,
    layers,
    mandatoryViolations: [
      ...(snapshot?.mandatoryViolations ?? row.mandatoryViolations),
    ],
    groupBlocks: pickDirectional(
      direction,
      snapshot?.longGroupBlocks,
      snapshot?.shortGroupBlocks,
      snapshot?.groupBlocks,
    ),
    hardBlocks: pickDirectional(
      direction,
      snapshot?.longHardBlocks,
      snapshot?.shortHardBlocks,
      undefined,
    ),
    blockReasons: pickDirectional(
      direction,
      snapshot?.longBlockReasons,
      snapshot?.shortBlockReasons,
      undefined,
    ),
    warnings: pickDirectional(
      direction,
      snapshot?.longWarnings,
      snapshot?.shortWarnings,
      undefined,
    ),
    scoringWarnings: [...(snapshot?.scoringWarnings ?? [])],
    squeezeWarning: snapshot?.squeezeWarning ?? row.squeezeWarning ?? null,
    adxBlockReason: row.adxBlockReason,
    ambiguousMessage: snapshot?.ambiguousMessage ?? row.ambiguousMessage,
    finalEntryStatus: snapshot?.finalEntryStatus ?? row.finalEntryStatus,
  };
}
