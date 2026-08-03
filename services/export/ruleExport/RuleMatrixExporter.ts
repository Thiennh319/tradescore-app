/**
 * TASK R1.4 — Rule Matrix Export (Architecture: FROZEN).
 * TASK R1.4.1 — Explainability extension (backward compatible).
 *
 * Read-only export of already-evaluated rule results.
 * This module copies engine output into a standard Rule Matrix for AI review.
 * It never re-runs rules, never recalculates score/weight/decision/trend.
 * Explainability fields are copied from the frozen evaluation only —
 * when the engine did not record a value, the exporter emits null / '' / [].
 */

export type RuleMatrixStatus = 'PASS' | 'WARNING' | 'FAIL' | 'SKIPPED';

export type RuleMatrixSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type RuleMatrixOperator =
  | '>'
  | '>='
  | '<'
  | '<='
  | '='
  | '!='
  | ''
  | null;

export type RuleMatrixBlockType = 'NONE' | 'SOFT' | 'HARD';

export type RuleMatrixValue = string | number | boolean | null;

export type RuleMatrixLayer =
  | 'Trend'
  | 'Momentum'
  | 'Volume'
  | 'Liquidity'
  | 'Risk'
  | 'Context'
  | 'Execution'
  | 'RuleBook';

export type RuleMatrixCategory =
  | 'EMA'
  | 'RSI'
  | 'MACD'
  | 'ATR'
  | 'Funding'
  | 'OI'
  | 'CVD'
  | 'Volume'
  | 'Whale'
  | 'Support'
  | 'Resistance'
  | 'Spread'
  | 'RR'
  | 'Timing'
  | 'Execution'
  | 'RuleBook';

/**
 * One rule result as already evaluated by the engine (frozen input).
 * Every field is copied as-is — the exporter derives nothing from raw market data.
 */
export interface RuleEvaluationItem {
  id: string;
  title: string;
  layer: RuleMatrixLayer;
  category: RuleMatrixCategory;
  mandatory: boolean;
  enabled: boolean;
  weight: number;
  maxScore: number;
  score: number;
  status: RuleMatrixStatus;
  reason: string;
  recommendation: string;

  // ── R1.4.1 explainability (optional on input — frozen engine data only) ──
  /** Value the rule actually read (e.g. 0.82, "EMA20 > EMA50 > EMA200"). */
  actual?: RuleMatrixValue;
  /** Threshold the rule required (e.g. 1.2, "Bullish Alignment"). */
  expected?: RuleMatrixValue;
  /** Comparison the rule applied. */
  operator?: RuleMatrixOperator;
  /** Unit of actual/expected (e.g. "%", "RR", "ratio", "USDT", "ATR"). */
  unit?: string;
  /** Module that produced the data (e.g. "Volume Engine", "RuleBook"). */
  source?: string;
  /** Rule ids this rule depends on. */
  dependency?: readonly string[];
  /** Pipeline position the rule ran at (1-based). */
  evaluationOrder?: number;
  /** Blocking behaviour recorded by the engine. */
  blockType?: RuleMatrixBlockType;
  /** Impact level recorded by the engine. */
  severity?: RuleMatrixSeverity;
}

/**
 * Frozen evaluation snapshot produced by the engine.
 * `evaluatedAt` (ISO) keeps the export deterministic; when absent the
 * exporter stamps the current time (content fingerprint stays stable).
 */
export interface RuleEvaluationResult {
  rules: readonly RuleEvaluationItem[];
  evaluatedAt?: string;
}

export interface RuleMatrixItem {
  id: string;
  title: string;
  layer: string;
  category: string;
  mandatory: boolean;
  enabled: boolean;
  weight: number;
  maxScore: number;
  score: number;
  status: RuleMatrixStatus;

  // ── R1.4.1 explainability (null / '' / [] when the engine has no data) ──
  /** null when the engine did not record severity — never guessed. */
  severity: RuleMatrixSeverity | null;
  actual: RuleMatrixValue;
  operator: RuleMatrixOperator;
  expected: RuleMatrixValue;
  unit: string;
  source: string;
  dependency: readonly string[];
  /** 0 when the engine did not record pipeline order. */
  evaluationOrder: number;
  blockType: RuleMatrixBlockType;

  reason: string;
  recommendation: string;
}

export interface RuleMatrixExport {
  version: 1;
  generatedAt: string;
  fingerprint: string;
  totalRules: number;
  passedRules: number;
  warningRules: number;
  failedRules: number;
  mandatoryPassed: number;
  mandatoryFailed: number;
  rules: RuleMatrixItem[];
}

const RULE_MATRIX_VERSION = 1 as const;
const FIELD_SEPARATOR = '\x1f';
const RULE_SEPARATOR = '\x1e';

/** FNV-1a 32-bit → hex — same deterministic pattern as UL fingerprints. */
function fnv1aHex(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function numOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function valueOrNull(value: RuleMatrixValue | undefined): RuleMatrixValue {
  if (value === undefined) return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  return value;
}

/** Copy one evaluated rule — no derivation, no recalculation. */
function toMatrixItem(rule: RuleEvaluationItem): RuleMatrixItem {
  return {
    id: rule.id,
    title: rule.title,
    layer: rule.layer,
    category: rule.category,
    mandatory: rule.mandatory === true,
    enabled: rule.enabled === true,
    weight: numOrZero(rule.weight),
    maxScore: numOrZero(rule.maxScore),
    score: numOrZero(rule.score),
    status: rule.status,
    severity: rule.severity ?? null,
    actual: valueOrNull(rule.actual),
    operator: rule.operator ?? null,
    expected: valueOrNull(rule.expected),
    unit: rule.unit ?? '',
    source: rule.source ?? '',
    dependency: rule.dependency ? [...rule.dependency] : [],
    evaluationOrder:
      rule.evaluationOrder != null && Number.isFinite(rule.evaluationOrder)
        ? rule.evaluationOrder
        : 0,
    blockType: rule.blockType ?? 'NONE',
    reason: rule.reason ?? '',
    recommendation: rule.recommendation ?? '',
  };
}

function ruleFingerprintPart(rule: RuleMatrixItem): string {
  return [
    rule.id,
    rule.title,
    rule.layer,
    rule.category,
    rule.mandatory ? '1' : '0',
    rule.enabled ? '1' : '0',
    String(rule.weight),
    String(rule.maxScore),
    String(rule.score),
    rule.status,
    String(rule.severity),
    String(rule.actual),
    String(rule.operator),
    String(rule.expected),
    rule.unit,
    rule.source,
    rule.dependency.join(','),
    String(rule.evaluationOrder),
    rule.blockType,
    rule.reason,
    rule.recommendation,
  ].join(FIELD_SEPARATOR);
}

/** Content fingerprint — order-independent, timestamp-independent. */
function buildFingerprint(rules: readonly RuleMatrixItem[]): string {
  if (rules.length === 0) return 'empty';
  const parts = rules.map(ruleFingerprintPart);
  parts.sort();
  return fnv1aHex(parts.join(RULE_SEPARATOR));
}

/**
 * Build the Rule Matrix export from a frozen evaluation result.
 *
 * O(n) over rules. Read-only: the input is never mutated and no rule
 * is re-evaluated; all counters are simple tallies of existing statuses.
 */
export function buildRuleMatrixExport(
  ruleEvaluation: RuleEvaluationResult,
): RuleMatrixExport {
  const rules = ruleEvaluation.rules.map(toMatrixItem);

  let passedRules = 0;
  let warningRules = 0;
  let failedRules = 0;
  let mandatoryPassed = 0;
  let mandatoryFailed = 0;

  for (const rule of rules) {
    if (rule.status === 'PASS') passedRules += 1;
    else if (rule.status === 'WARNING') warningRules += 1;
    else if (rule.status === 'FAIL') failedRules += 1;

    if (rule.mandatory) {
      if (rule.status === 'PASS') mandatoryPassed += 1;
      else if (rule.status === 'FAIL') mandatoryFailed += 1;
    }
  }

  return {
    version: RULE_MATRIX_VERSION,
    generatedAt: ruleEvaluation.evaluatedAt ?? new Date().toISOString(),
    fingerprint: buildFingerprint(rules),
    totalRules: rules.length,
    passedRules,
    warningRules,
    failedRules,
    mandatoryPassed,
    mandatoryFailed,
    rules,
  };
}
