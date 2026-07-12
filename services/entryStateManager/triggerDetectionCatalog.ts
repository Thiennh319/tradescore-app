/**
 * Trigger Detection Engine — type catalog & documentation (Task 02.4.1).
 *
 * **Five trigger kinds only** — aligned with RuleBook / Evaluation Pipeline:
 * HardBlock, Unlock, Recovery, Confirmation, Noise.
 *
 * **No detection algorithm** — static definitions and edge/failure docs.
 *
 * @module entryStateManager/triggerDetectionCatalog
 */

import { EntryTriggerKind } from './evaluationTypes';
import {
  TRANSITION_CATEGORY_PRIORITY,
  TransitionAuditLabel,
  TransitionCategory,
} from './transitionMetadata';
import type {
  TriggerEdgeCaseSpec,
  TriggerFailureScenarioSpec,
  TriggerTypeDefinition,
  TriggerTypeId,
} from './triggerDetectionTypes';

/** Build canonical trigger type ID. */
export function triggerTypeId(kind: EntryTriggerKind): TriggerTypeId {
  return `ESM-TRIG-${kind}`;
}

/**
 * Locked catalog — one definition per {@link EntryTriggerKind}.
 *
 * **Do not add** trigger types without RuleBook approval.
 */
export const TRIGGER_TYPE_CATALOG: Readonly<Record<EntryTriggerKind, TriggerTypeDefinition>> = {
  [EntryTriggerKind.HardBlock]: {
    triggerId: triggerTypeId(EntryTriggerKind.HardBlock),
    triggerType: EntryTriggerKind.HardBlock,
    triggerCategory: TransitionCategory.HardBlock,
    sourceModule: 'RuleEngine',
    priority: TRANSITION_CATEGORY_PRIORITY[TransitionCategory.HardBlock],
    auditLabel: TransitionAuditLabel.ENTRY_BLOCK,
    ruleReference: 'RuleBook V2 §1.4 / §6',
    description: 'Hard or group block active — cấm vào lệnh.',
  },
  [EntryTriggerKind.Unlock]: {
    triggerId: triggerTypeId(EntryTriggerKind.Unlock),
    triggerType: EntryTriggerKind.Unlock,
    triggerCategory: TransitionCategory.Unlock,
    sourceModule: 'EntryStateManager',
    priority: TRANSITION_CATEGORY_PRIORITY[TransitionCategory.Unlock],
    auditLabel: TransitionAuditLabel.ENTRY_UNLOCK,
    ruleReference: 'RuleBook V2 §4 / Business Workflow',
    description: 'Giá ra khỏi entry lock zone hoặc unlock mềm.',
  },
  [EntryTriggerKind.Recovery]: {
    triggerId: triggerTypeId(EntryTriggerKind.Recovery),
    triggerType: EntryTriggerKind.Recovery,
    triggerCategory: TransitionCategory.Recovery,
    sourceModule: 'RuleEngine',
    priority: TRANSITION_CATEGORY_PRIORITY[TransitionCategory.Recovery],
    auditLabel: TransitionAuditLabel.ENTRY_RECOVERY,
    ruleReference: 'RuleBook V2 §2.2 / Business Workflow 02.2.2.1',
    description: 'BLOCKED → WATCH — hard block cleared, xác nhận recovery.',
  },
  [EntryTriggerKind.Confirmation]: {
    triggerId: triggerTypeId(EntryTriggerKind.Confirmation),
    triggerType: EntryTriggerKind.Confirmation,
    triggerCategory: TransitionCategory.Confirmation,
    sourceModule: 'EntryStateManager',
    priority: TRANSITION_CATEGORY_PRIORITY[TransitionCategory.Confirmation],
    auditLabel: TransitionAuditLabel.ENTRY_CONFIRM,
    ruleReference: 'RuleBook V2 §1.1 / §3',
    description: 'WATCH → READY — điều kiện xác nhận đủ (hysteresis task sau).',
  },
  [EntryTriggerKind.Noise]: {
    triggerId: triggerTypeId(EntryTriggerKind.Noise),
    triggerType: EntryTriggerKind.Noise,
    triggerCategory: TransitionCategory.NoiseFilter,
    sourceModule: 'CVDFilter',
    priority: TRANSITION_CATEGORY_PRIORITY[TransitionCategory.NoiseFilter],
    auditLabel: TransitionAuditLabel.ENTRY_NOISE_FILTER,
    ruleReference: 'RuleBook V2 §3 / §1.2',
    description: 'READY → WATCH — momentum/plan borderline, chống nhiễu.',
  },
};

/** All catalog entries as array — for validation / export. */
export const TRIGGER_TYPE_CATALOG_LIST: readonly TriggerTypeDefinition[] = Object.values(
  TRIGGER_TYPE_CATALOG,
);

/**
 * Edge cases — **documented only**, no runtime handler (Task 02.4.1).
 */
export const TRIGGER_EDGE_CASE_SPECS: readonly TriggerEdgeCaseSpec[] = [
  {
    id: 'EDGE-001',
    title: 'HardBlock + Confirmation cùng lúc',
    description:
      'hardBlocks active đồng thời canEnter=true trên signal — xung đột ưu tiên.',
    involvedKinds: [EntryTriggerKind.HardBlock, EntryTriggerKind.Confirmation],
    expectedBehavior:
      'State Machine sort theo priority: HardBlock (100) trước Confirmation (60). Không tự xử lý ở detection layer.',
  },
  {
    id: 'EDGE-002',
    title: 'Unlock + Noise',
    description: 'Giá ra lock zone trong khi momentum yếu — LOCKED→WATCH và READY→WATCH candidates.',
    involvedKinds: [EntryTriggerKind.Unlock, EntryTriggerKind.Noise],
    expectedBehavior:
      'Detection có thể emit cả hai; SM chọn theo priority Unlock (70) vs Noise (50) và current state.',
  },
  {
    id: 'EDGE-003',
    title: 'Recovery + HardBlock',
    description: 'Hard block vừa hết nhưng soft block còn — BLOCKED→WATCH vs re-block.',
    involvedKinds: [EntryTriggerKind.Recovery, EntryTriggerKind.HardBlock],
    expectedBehavior:
      'Recovery chỉ khi hardBlocks rỗng; nếu block quay lại → HardBlock ưu tiên.',
  },
  {
    id: 'EDGE-004',
    title: 'Không có Trigger',
    description: 'Snapshot hợp lệ nhưng không điều kiện nào match trigger catalog.',
    involvedKinds: [],
    expectedBehavior: 'TriggerDetectionResult.triggers = []. SM giữ state (self-loop).',
  },
  {
    id: 'EDGE-005',
    title: 'Nhiều Trigger cùng Priority',
    description: 'Ví dụ Recovery và Unlock đều priority 70.',
    involvedKinds: [EntryTriggerKind.Recovery, EntryTriggerKind.Unlock],
    expectedBehavior:
      'Sort ổn định theo triggerId; SM tie-break bằng current state + candidate list — task sau.',
  },
] as const;

/**
 * Failure scenarios — **documentation only** (Task 02.4.1).
 */
export const TRIGGER_FAILURE_SCENARIO_SPECS: readonly TriggerFailureScenarioSpec[] = [
  {
    id: 'FAIL-001',
    title: 'Snapshot thiếu',
    description: 'marketSnapshot hoặc signalSnapshot undefined / thiếu symbol.',
    detectionAction: 'halted=true; triggers=[]; failureScenarioId=FAIL-001.',
  },
  {
    id: 'FAIL-002',
    title: 'Trigger Metadata lỗi',
    description: 'Catalog row thiếu auditLabel hoặc priority âm.',
    detectionAction: 'validateTriggerCatalog() fails at dev time; runtime skip detection.',
  },
  {
    id: 'FAIL-003',
    title: 'Unknown Source Module',
    description: 'sourceModule không thuộc TRANSITION_SOURCE_MODULES.',
    detectionAction: 'halted=true; không emit trigger với module lạ.',
  },
  {
    id: 'FAIL-004',
    title: 'Priority sai',
    description: 'Detected trigger priority không khớp TRIGGER_TYPE_CATALOG.',
    detectionAction: 'Validation reject; không ghi journal.',
  },
  {
    id: 'FAIL-005',
    title: 'Candidate Transition rỗng',
    description: 'candidateTransitions=[] từ pipeline step 3.',
    detectionAction:
      'Detection vẫn có thể chạy; triggers không bind relatedTransitionId. SM không có edge.',
  },
] as const;

/**
 * Validates trigger catalog data integrity — **no detection**, dev/CI only.
 */
export function validateTriggerCatalog(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const kinds = Object.values(EntryTriggerKind);
  if (Object.keys(TRIGGER_TYPE_CATALOG).length !== kinds.length) {
    errors.push('Catalog size mismatch vs EntryTriggerKind');
  }
  for (const kind of kinds) {
    const def = TRIGGER_TYPE_CATALOG[kind];
    if (!def) {
      errors.push(`Missing catalog entry: ${kind}`);
      continue;
    }
    if (def.triggerId !== triggerTypeId(kind)) {
      errors.push(`triggerId mismatch: ${kind}`);
    }
    if (def.priority < 0) {
      errors.push(`Negative priority: ${kind}`);
    }
    if (!def.sourceModule?.trim()) {
      errors.push(`Empty sourceModule: ${kind}`);
    }
  }
  return { valid: errors.length === 0, errors };
}
