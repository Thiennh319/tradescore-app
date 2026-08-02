/**
 * TASK 17.5.2 — shared Trace presentation labels.
 *
 * Documentation / export wording only. No score arithmetic, no Decision
 * change, no RuleBook / Engine / Snapshot mutation.
 *
 * Canonical vocabulary for Rule Trace and Score Trace layer rows:
 *   Status         → PASS | FAIL | WARNING | SKIPPED
 *   Recommendation → OK | Review Layer
 *   Dependency     → Layer N   (layer number/ID only — never the component name)
 */

export type TraceLayerStatus = 'PASS' | 'FAIL' | 'WARNING';

/** Rule Trace Block Type — must mirror engine Hard vs Score (soft) lists. */
export type TraceLayerBlockType = 'HARD' | 'SOFT' | 'UNLOCK' | 'NONE';

/** Layer pass/fail presentation shared by Rule Trace and Score Trace.
 *
 * RuleBook-aligned (export only — no engine change):
 * - passed                         → PASS
 * - score/path fail + mandatory    → FAIL   (mandatory floor miss — Status only)
 * - score/path fail + non-mandatory→ WARNING (soft / WARNING path)
 *
 * Note: Status FAIL ≠ Block Type HARD. L5a mandatory floor miss is usually a
 * Score Block (soft) in the engine; Block Type is resolved separately via
 * {@link resolveRuleTraceBlockType}.
 *
 * Both Rule Trace and Score Trace MUST call this same helper so L4 (and every
 * other layer) never diverge for one frozen snapshot.
 */
export function layerTraceStatus(
  passed: boolean,
  isMandatoryViolation: boolean,
): TraceLayerStatus {
  if (passed) return 'PASS';
  if (isMandatoryViolation) return 'FAIL';
  return 'WARNING';
}

/**
 * Whether an engine hardBlocks / blockReasons string refers to this layer.
 * Score Block examples: "L5a CVD chưa đủ 1đ — …"
 * Hard Block examples: "L3 MACD vi phạm — …", "CVD +2.1M > +2M — chặn Short…"
 *
 * Matching rules (word-boundary / exact token — avoid L5a↔L5b bleed):
 * - L5a (layer 5): reason starts with `L5a` OR starts with `CVD` (CVD extreme hard)
 * - L5b (layer 52): reason starts with `L5b` only — never `L5` / `L5a` / bare CVD
 * - L3: `L3…` OR `MACD vi phạm` OR NEAR-only S1 `NEAR SHORT — L3 MACD…`
 * - L6: `L6…` OR engine Funding hard (`Funding … quá cao/thấp`)
 * - L8: `L8…` OR engine BTC hard (`BTC …`)
 * - Other Ln: reason starts with `Ln` as a whole token (`^Ln\b`)
 */
export function layerMatchesEngineBlockReason(
  reason: string,
  layer: { layer: number; name: string },
): boolean {
  const r = reason.trim();
  if (!r) return false;
  const name = layer.name.toLowerCase();

  // L5a — display layer id 5. Prefer ^L5a / ^CVD (not mid-string \bCVD\b).
  if (layer.layer === 5 || name.includes('l5a')) {
    return /^L5a\b/i.test(r) || /^CVD\b/i.test(r);
  }

  // L5b — LAYER_L5B_ID = 52. Exact L5b token only.
  if (layer.layer === 52 || name.includes('l5b')) {
    return /^L5b\b/i.test(r);
  }

  // L6 Funding hard blocks from engine start with "Funding", not "L6".
  if (layer.layer === 6) {
    return /^L6\b/i.test(r) || /^Funding\b/i.test(r);
  }

  // L8 BTC hard blocks from engine start with "BTC".
  if (layer.layer === 8) {
    return /^L8\b/i.test(r) || /^BTC\b/i.test(r);
  }

  // L3 MACD — shared hard (`L3 MACD vi phạm…`) + NEAR-only S1 gate
  // (`NEAR SHORT — L3 MACD < 1.5 (gate NEAR-only)` — does not start with L3).
  if (layer.layer === 3 || name.includes('macd')) {
    return (
      /^L3\b/i.test(r) ||
      /NEAR SHORT — L3 MACD/i.test(r) ||
      /MACD vi phạm/i.test(r)
    );
  }

  // Generic Ln — digit boundary so L10 does not match L1, etc.
  return new RegExp(`^L${layer.layer}\\b`, 'i').test(r);
}

/**
 * Map a scoring layer to Rule Trace `blockType` from engine lists (copy-only).
 *
 * SSOT for reviewers: export appendix
 *   AI REVIEW SPECIFICATION → BLOCK TYPE RESOLUTION (DETERMINISTIC — DO NOT INFER)
 *   (+ REVIEW RULES Rule 7). Maintainer MUST keep this function aligned with that table.
 *
 * Priority: Hard list → Score Block (soft) list → mandatory floor miss → NONE.
 * Never treat `isMandatoryViolation` alone as HARD — L5a score-floor miss is a
 * soft Score Block unless the same layer also appears in hardBlocks.
 * (Bug fixed 2026-07-22: Mandatory/Status/Actual must NOT imply HARD.)
 */
export function resolveRuleTraceBlockType(
  layer: {
    layer: number;
    name: string;
    isMandatoryViolation: boolean;
  },
  hardBlocks: readonly string[] | null | undefined,
  scoreBlocks: readonly string[] | null | undefined,
): TraceLayerBlockType {
  const hard = hardBlocks ?? [];
  const soft = scoreBlocks ?? [];
  if (hard.some((b) => layerMatchesEngineBlockReason(b, layer))) return 'HARD';
  if (soft.some((b) => layerMatchesEngineBlockReason(b, layer))) return 'SOFT';
  if (layer.isMandatoryViolation) return 'SOFT';
  return 'NONE';
}

/** Non-pass layers always recommend the same review action. */
export function layerTraceRecommendation(passed: boolean): 'OK' | 'Review Layer' {
  return passed ? 'OK' : 'Review Layer';
}

/**
 * Single dependency / source-module label for a scoring layer.
 *
 * Target is the layer number/ID only (`Layer 1`, `Layer 5`, …). Using the
 * component/rule title here caused SCORE DEPENDENCY self-references such as
 * "Giá & EMA depends Giá & EMA". The optional `layerName` argument is kept for
 * call-site compatibility and is intentionally ignored.
 */
export function layerTraceDependency(layerNumber: number, _layerName?: string): string {
  return `Layer ${layerNumber}`;
}

/**
 * Normalize legacy recommendation spellings so Rule Trace and Score Trace
 * never diverge in Markdown output.
 */
export function normalizeTraceRecommendation(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (
    normalized === 'review' ||
    normalized === 'review layer' ||
    normalized === 'needs review' ||
    normalized === 'fix layer'
  ) {
    return 'Review Layer';
  }
  return value;
}

/** Dependency bullet used by both RULE DEPENDENCY and SCORE DEPENDENCY. */
export function formatTraceDependsLine(title: string, dependency: string): string {
  return `- ${title} depends ${dependency}`;
}

/**
 * Psychology checklist (L10 / “Tâm lý & Kỷ luật”) reason copy — presentation
 * only. Remaps legacy “N/5 mục — chưa đủ” (and any N/5 prefix) to the
 * canonical vocabulary used by Rule Trace / Score Trace after the L10 reason
 * text fix. Non-matching reasons are returned unchanged.
 */
const PSYCHOLOGY_CHECKLIST_REASON_BY_COUNT: Readonly<Record<number, string>> = {
  5: '5/5 mục — đạt tối đa',
  4: '4/5 mục — đạt',
  3: '3/5 mục — đạt tối thiểu',
  2: '2/5 mục — chưa đủ, tâm lý chưa sẵn sàng',
  1: '1/5 mục — không đạt',
  0: '0/5 mục — không đạt',
};

export function normalizePsychologyLayerReason(reason: string): string {
  const match = /^(\d+)\s*\/\s*5\s*mục/u.exec(reason.trim());
  if (!match) return reason;
  const count = Number(match[1]);
  return PSYCHOLOGY_CHECKLIST_REASON_BY_COUNT[count] ?? reason;
}
