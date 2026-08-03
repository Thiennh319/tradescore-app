/**
 * TASK 17.5.3.4 — Shared TracePresentationLayer block renderer.
 *
 * Renders ONE layer / component Markdown block from a frozen
 * TracePresentationLayer. No presentation decisions (status, recommendation,
 * dependency) are made here — values are read verbatim from the DTO.
 *
 * Kind-specific headers and field order are preserved so Rule Trace and
 * Score Trace Markdown stay byte-identical to their prior formatters.
 */

import { kv, UNAVAILABLE } from '../formatters/markdown';
import type { TracePresentationLayer } from '../tracePresentationTypes';

/** Which Trace document layout to emit for this layer row. */
export type TraceLayerBlockKind = 'rule' | 'component';

/** Evidence bullets shared by Rule and Score layer blocks. */
function renderTraceLayerEvidence(
  layer: TracePresentationLayer,
): string[] {
  if (layer.evidence.length === 0) return [`- ${UNAVAILABLE}`];
  return layer.evidence.map((item) => `- ${item.label}=${item.value}`);
}

/**
 * Shared explainability fields that both Trace documents print for a layer.
 * Field order matches the historical Score Trace component block
 * (Actual before Expected). Rule Trace uses its own Expected→Actual order
 * inside `renderTraceLayer(..., 'rule')`.
 */
function renderSharedExplainabilityTail(
  layer: TracePresentationLayer,
  actualBeforeExpected: boolean,
): string[] {
  const actualExpected = actualBeforeExpected
    ? [kv('Actual', layer.actual), kv('Expected', layer.expected)]
    : [kv('Expected', layer.expected), kv('Actual', layer.actual)];
  return [
    ...actualExpected,
    kv('Reason', layer.reason),
    kv('Recommendation', layer.recommendation),
    kv('Source Module', layer.sourceLayer),
    'Evidence:',
    ...renderTraceLayerEvidence(layer),
  ];
}

function renderRuleLayerBlock(layer: TracePresentationLayer): string[] {
  return [
    `Rule ${String(layer.index).padStart(3, '0')}`,
    '',
    layer.layerName,
    '',
    kv('Status', layer.status),
    kv('Weight', layer.weight),
    kv('Priority', layer.priority),
    kv('Block Type', layer.blockType),
    kv('Mandatory', layer.mandatory),
    ...renderSharedExplainabilityTail(layer, false),
  ];
}

function renderComponentLayerBlock(layer: TracePresentationLayer): string[] {
  return [
    `Component ${String(layer.index).padStart(3, '0')}`,
    '',
    kv('Score ID', layer.id),
    kv('Name', layer.layerName),
    kv('Category', layer.category),
    kv('Weight', layer.weight),
    kv('Max Score', layer.maxScore),
    kv('Actual Score', layer.actualScore),
    // TASK 18.7 — was "Contribution"; display-layer scale ≠ Decision Total.
    kv('Display Layer Score', layer.contributionText),
    kv('Status', layer.status),
    ...renderSharedExplainabilityTail(layer, true),
  ];
}

/**
 * Render one TracePresentationLayer as Markdown lines for a Rule or
 * Score Trace document. Callers supply `kind` so each document keeps its
 * historical block layout (byte-identical).
 */
export function renderTraceLayer(
  layer: TracePresentationLayer,
  kind: TraceLayerBlockKind,
): string[] {
  return kind === 'rule'
    ? renderRuleLayerBlock(layer)
    : renderComponentLayerBlock(layer);
}
