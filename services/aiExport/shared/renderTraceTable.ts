/**
 * TASK 17.5.3.5 — Shared TracePresentationLayer table renderer.
 *
 * Renders Markdown tables whose rows come exclusively from
 * TracePresentationLayer[]. No mapping, normalization, or score math —
 * values are copied into cells as already prepared on the DTO.
 *
 * Kind selects the historical column set / order so Rule Trace and Score
 * Trace stay byte-identical to their prior formatters.
 */

import { table } from '../formatters/markdown';
import type { TracePresentationLayer } from '../tracePresentationTypes';

/** Which layer-backed Markdown table layout to emit. */
export type TraceTableKind = 'evaluation' | 'score' | 'explainability';

/**
 * Render one Markdown table from TracePresentationLayer rows.
 * Returns only the table lines (header, separator, body) — section titles
 * and surrounding chrome stay in the calling formatter.
 */
export function renderTraceTable(
  layers: readonly TracePresentationLayer[],
  kind: TraceTableKind,
): string[] {
  switch (kind) {
    case 'evaluation':
      return table(
        ['Rule', 'PASS', 'FAIL', 'Weight', 'Priority'],
        layers.map((layer) => [
          layer.layerName,
          layer.evaluationPass,
          layer.evaluationFail,
          layer.weight,
          layer.priority,
        ]),
      );
    case 'score':
      // TASK 18.7 — column was "Contribution"; display-layer values must not be
      // summed to Decision Total / Final Score (same root cause as Option B).
      return table(
        ['Component', 'Max', 'Actual', 'Display Layer Score', 'Status'],
        layers.map((layer) => [
          layer.layerName,
          layer.maxScore,
          layer.actualScore,
          layer.contributionText,
          layer.status,
        ]),
      );
    case 'explainability':
      return table(
        ['Component', 'Actual', 'Expected', 'Reason', 'Recommendation', 'Source'],
        layers.map((layer) => [
          layer.layerName,
          layer.actual,
          layer.expected,
          layer.reason,
          layer.recommendation,
          layer.sourceLayer,
        ]),
      );
  }
}
