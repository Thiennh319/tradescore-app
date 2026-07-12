/**
 * Trigger Detection Engine — scaffold helpers (Task 02.4.1).
 *
 * **Detects triggers only** — never selects state or transitions.
 *
 * **No `detectTriggers()` implementation** in this task — Task 02.4.2+.
 *
 * @module entryStateManager/triggerDetectionEngine
 */

import type { TriggerDetectionContext, TriggerDetectionResult } from './triggerDetectionTypes';

/** Message when detection is not yet implemented. */
export const TRIGGER_DETECTION_NOT_IMPLEMENTED_MESSAGE =
  'Trigger detection logic not implemented — Task 02.4.2+';

/**
 * Returns an empty detection result — **no triggers detected**, no state change.
 *
 * Placeholder for pipeline step 4 wiring; not algorithmic detection.
 */
export function createEmptyTriggerDetectionResult(
  context: TriggerDetectionContext,
): TriggerDetectionResult {
  return {
    triggers: [],
    sortedByPriority: [],
    detectionMessage: TRIGGER_DETECTION_NOT_IMPLEMENTED_MESSAGE,
    halted: false,
    context,
  };
}

/**
 * Namespace for discoverability — detection API added in Task 02.4.2+.
 */
export const TriggerDetectionEngine = {
  createEmptyTriggerDetectionResult,
} as const;
