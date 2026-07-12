/**
 * Evaluation pipeline — unit test skeleton (Task 02.3.2).
 *
 * Verifies pipeline **definitions** only — no executor / no runtime.
 */

import { describe, expect, it } from 'vitest';
import {
  ENTRY_STATE_EVALUATION_NEXT_STEP_PLACEHOLDER,
  ENTRY_STATE_EVALUATION_PIPELINE_STEPS,
  ENTRY_TRIGGER_KIND_CATEGORY_MAP,
} from './evaluationPipeline';
import { EntryStateEvaluationStep, EntryTriggerKind } from './evaluationTypes';

describe('EntryStateEvaluationPipeline — skeleton', () => {
  it('defines exactly 7 steps in order', () => {
    expect(ENTRY_STATE_EVALUATION_PIPELINE_STEPS).toHaveLength(7);
    expect(ENTRY_STATE_EVALUATION_PIPELINE_STEPS[0]?.step).toBe(
      EntryStateEvaluationStep.ReadSnapshot,
    );
    expect(ENTRY_STATE_EVALUATION_PIPELINE_STEPS[6]?.step).toBe(
      EntryStateEvaluationStep.EmitResult,
    );
  });

  it('step 2 halts on validation failure', () => {
    const validateStep = ENTRY_STATE_EVALUATION_PIPELINE_STEPS.find(
      (s) => s.id === 'VALIDATE_SNAPSHOT',
    );
    expect(validateStep?.haltOnFailure).toBe(true);
  });

  it('step 6 placeholder does not select a transition', () => {
    expect(ENTRY_STATE_EVALUATION_NEXT_STEP_PLACEHOLDER.selectedTransitionId).toBeNull();
  });

  it('maps trigger kinds to categories', () => {
    expect(ENTRY_TRIGGER_KIND_CATEGORY_MAP[EntryTriggerKind.HardBlock]).toBe('HardBlock');
    expect(ENTRY_TRIGGER_KIND_CATEGORY_MAP[EntryTriggerKind.Noise]).toBe('NoiseFilter');
  });
});
