/**
 * Detection Layer API freeze declaration (Task 02.4.R).
 *
 * **STATUS: FROZEN** — no Context/Result/Builder/Adapter/Metadata contract changes
 * except critical bug fixes, until Trigger Aggregator (02.5+) integration review.
 *
 * @module entryStateManager/detectionLayerFreeze
 */

/** Detection Layer public API freeze status. */
export const DETECTION_LAYER_API_STATUS = 'FROZEN' as const;

/** Module version at freeze. */
export const DETECTION_LAYER_FROZEN_VERSION = '0.6.2' as const;

/** ISO8601 date of freeze review. */
export const DETECTION_LAYER_FROZEN_DATE = '2026-07-11' as const;

/** Five runtime detectors covered by freeze. */
export const DETECTION_LAYER_FROZEN_DETECTORS = [
  'HardBlock',
  'Recovery',
  'Unlock',
  'Confirmation',
  'Noise',
] as const;

export type DetectionLayerFrozenDetector = (typeof DETECTION_LAYER_FROZEN_DETECTORS)[number];
