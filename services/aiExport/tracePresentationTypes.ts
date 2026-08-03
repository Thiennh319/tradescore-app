/**
 * TASK 17.5.3.1 / 17.5.3.2 — Shared Trace Presentation DTO.
 *
 * Presentation-layer data contract shared by Rule Trace and Score Trace.
 * Types only in this file:
 * - no Engine / Builder / Formatter imports
 * - no status, recommendation, or dependency mapping
 * - no Markdown rendering
 */

import type { TraceLayerStatus } from './traceLayerPresentation';

/** One canonical evidence line, already stringified for presentation. */
export interface TracePresentationEvidence {
  readonly label: string;
  readonly value: string;
}

/**
 * One scoring layer / rule row as Trace documents present it.
 *
 * Every field is a frozen, display-ready value. Mappers outside the
 * formatters populate this DTO; formatters only read and render it.
 */
export interface TracePresentationLayer {
  /** Stable export id, e.g. "L5" or "R001". */
  readonly id: string;
  /** 1-based display index ("Rule 001" / "Component 001"). */
  readonly index: number;
  /** Numeric layer index when known, e.g. 5; otherwise 0. */
  readonly layerNumber: number;
  /** Short layer code, e.g. "L5a" or the rule id. */
  readonly layerCode: string;
  /** Full display name / rule title. */
  readonly layerName: string;
  /** Canonical status vocabulary (TASK 17.5.2): PASS | WARNING | FAIL (or SKIPPED). */
  readonly status: TraceLayerStatus | 'SKIPPED';
  /** Canonical recommendation wording, already normalized. */
  readonly recommendation: string;
  /** Display-ready expected value. */
  readonly expected: string;
  /** Display-ready actual value. */
  readonly actual: string;
  /** Score contribution as reported by the engine, when available. */
  readonly contribution?: number;
  /** Canonical dependency label, e.g. "Layer 5". */
  readonly dependency: string;
  /** Canonical source-module label; equals dependency (Layer N). */
  readonly sourceLayer: string;
  /** Preformatted dependency bullet: "- <title> depends <dependency>". */
  readonly dependsLine: string;
  /** Whether the layer is mandatory in the RuleBook. */
  readonly mandatory: boolean;
  /** Copied reason text (verbatim from the frozen snapshot). */
  readonly reason: string;
  /** Evidence lines already formatted as label/value pairs. */
  readonly evidence: readonly TracePresentationEvidence[];
  /** Display-ready weight. */
  readonly weight: string;
  /** Display-ready priority. */
  readonly priority: string;
  /** Display-ready block type (HARD / SOFT / UNLOCK / NONE). */
  readonly blockType: string;
  /** Evaluation-table PASS column cell ("YES" or "-"), precomputed by mapper. */
  readonly evaluationPass: string;
  /** Evaluation-table FAIL column cell ("YES" or "-"), precomputed by mapper. */
  readonly evaluationFail: string;
  /** Score Trace only: component category ("Layer N"). */
  readonly category?: string;
  /** Score Trace only: display-ready max score. */
  readonly maxScore?: string;
  /** Score Trace only: display-ready actual score. */
  readonly actualScore?: string;
  /** Score Trace only: display-ready contribution string (kv value). */
  readonly contributionText?: string;
}

/**
 * Shared presentation document header for a Trace export.
 * Values are copied from export metadata; missing values stay undefined.
 */
export interface TracePresentationMetadata {
  readonly version?: string;
  readonly generatedAt?: string;
  readonly tradeId?: string;
  readonly coin?: string;
  readonly side?: string;
  readonly engineVersion?: string;
  readonly scorerVersion?: string;
  readonly ruleVersion?: string;
}

/**
 * Full shared presentation model: one header plus the canonical layer rows,
 * in engine order.
 */
export interface TracePresentation {
  readonly metadata: TracePresentationMetadata;
  readonly layers: readonly TracePresentationLayer[];
}
