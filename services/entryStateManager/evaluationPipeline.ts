/**
 * State Evaluation Pipeline — step definitions (Task 02.3.2).
 *
 * **Purpose:** Document the mandatory 7-step evaluation order for the future state machine.
 *
 * **This module does NOT:**
 * - Execute transitions or change EntryState
 * - Call Entry Engine, Position Adviser, UI, Store, or Journal
 * - Run hysteresis, setup lock, or commit score
 * - Integrate with Scan Engine
 *
 * **Pipeline evaluates; State Machine decides** (Task 02.4+).
 *
 * @module entryStateManager/evaluationPipeline
 */

import { EntryTriggerKind, EntryStateEvaluationStep } from './evaluationTypes';

/** Maps trigger kind → evaluation category label for documentation. */
export const ENTRY_TRIGGER_KIND_CATEGORY_MAP: Readonly<Record<EntryTriggerKind, string>> = {
  [EntryTriggerKind.HardBlock]: 'HardBlock',
  [EntryTriggerKind.Unlock]: 'Unlock',
  [EntryTriggerKind.Recovery]: 'Recovery',
  [EntryTriggerKind.Confirmation]: 'Confirmation',
  [EntryTriggerKind.Noise]: 'NoiseFilter',
};

/**
 * One pipeline step specification — metadata only, no executor.
 */
export interface EntryStateEvaluationPipelineStepSpec {
  step: EntryStateEvaluationStep;
  id: string;
  title: string;
  description: string;
  input: string;
  output: string;
  /** When true, failure here halts pipeline (no transition). */
  haltOnFailure: boolean;
}

/**
 * Locked evaluation order — State Machine **must** follow this sequence.
 *
 * @see EntryStateEvaluationStep
 */
export const ENTRY_STATE_EVALUATION_PIPELINE_STEPS: readonly EntryStateEvaluationPipelineStepSpec[] =
  [
    {
      step: EntryStateEvaluationStep.ReadSnapshot,
      id: 'READ_SNAPSHOT',
      title: 'Đọc Snapshot hiện tại',
      description:
        'Đọc current EntryState, Signal snapshot, và Market snapshot từ context. Không ghi đè dữ liệu.',
      input: 'EntryStateEvaluationContext (partial — filled by caller)',
      output: 'Snapshot bundle hợp lệ về mặt cấu trúc',
      haltOnFailure: false,
    },
    {
      step: EntryStateEvaluationStep.ValidateSnapshot,
      id: 'VALIDATE_SNAPSHOT',
      title: 'Validate Snapshot',
      description:
        'Gọi State Validator (validateEntryState). Snapshot không hợp lệ → halted=true, không transition.',
      input: 'currentEntryState, optional esmSnapshot',
      output: 'EntryStateValidationResult',
      haltOnFailure: true,
    },
    {
      step: EntryStateEvaluationStep.CollectCandidates,
      id: 'COLLECT_CANDIDATES',
      title: 'Thu thập Candidate Transition',
      description:
        'Lọc ENTRY_ALLOWED_TRANSITIONS where fromState === current. Không tạo transition mới.',
      input: 'currentEntryState, ENTRY_ALLOWED_TRANSITIONS',
      output: 'EntryTransitionCandidate[]',
      haltOnFailure: false,
    },
    {
      step: EntryStateEvaluationStep.CollectTriggers,
      id: 'COLLECT_TRIGGERS',
      title: 'Thu thập Trigger',
      description:
        'Khai báo EntryTrigger slots (HardBlock, Unlock, Recovery, Confirmation, Noise). Logic task sau.',
      input: 'context + candidates',
      output: 'EntryTrigger[]',
      haltOnFailure: false,
    },
    {
      step: EntryStateEvaluationStep.SortTriggers,
      id: 'SORT_TRIGGERS',
      title: 'Sắp xếp Trigger',
      description:
        'Sắp xếp theo priority metadata (HardBlock=100 … NoiseFilter=50). Mô tả quy trình — không xử lý runtime.',
      input: 'EntryTrigger[]',
      output: 'sortedTriggers (priority desc)',
      haltOnFailure: false,
    },
    {
      step: EntryStateEvaluationStep.SelectCandidate,
      id: 'SELECT_CANDIDATE',
      title: 'Chọn Candidate (Placeholder)',
      description:
        'Placeholder cho State Machine. Không quyết định, không transition. selectedTransitionId = null.',
      input: 'candidates + sortedTriggers',
      output: 'EntryStateNextStepPlaceholder',
      haltOnFailure: false,
    },
    {
      step: EntryStateEvaluationStep.EmitResult,
      id: 'EMIT_RESULT',
      title: 'Xuất Evaluation Result',
      description:
        'Trả EntryStateEvaluationResult. Không thay đổi state, không ghi store/journal.',
      input: 'all step outputs',
      output: 'EntryStateEvaluationResult',
      haltOnFailure: false,
    },
  ] as const;

/** Default step-6 placeholder — no decision. */
export const ENTRY_STATE_EVALUATION_NEXT_STEP_PLACEHOLDER = {
  message: 'State Machine will select candidate — not implemented (Task 02.4+)',
  selectedTransitionId: null,
} as const;

/**
 * ASCII pipeline diagram for docs / export.
 *
 * **Not executable** — documentation string only.
 */
export const ENTRY_STATE_EVALUATION_PIPELINE_DIAGRAM = `
  ┌─────────────────────────────────────────────────────────────────┐
  │           ENTRY STATE EVALUATION PIPELINE (7 steps)              │
  │                  Evaluate only — SM decides later                  │
  └─────────────────────────────────────────────────────────────────┘

  [1] READ_SNAPSHOT
        │  currentEntryState + signal + market
        ▼
  [2] VALIDATE_SNAPSHOT ──invalid──► HALT (no transition)
        │  State Validator
        ▼ valid
  [3] COLLECT_CANDIDATES
        │  from ENTRY_ALLOWED_TRANSITIONS (matrix only)
        ▼
  [4] COLLECT_TRIGGERS
        │  HardBlock | Unlock | Recovery | Confirmation | Noise
        ▼
  [5] SORT_TRIGGERS
        │  by priority metadata (100 → 50)
        ▼
  [6] SELECT_CANDIDATE  ◄── PLACEHOLDER (null)
        │
        ▼
  [7] EMIT_RESULT
        EntryStateEvaluationResult (read-only)
` as const;
