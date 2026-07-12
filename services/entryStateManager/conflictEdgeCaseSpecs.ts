/**
 * Conflict edge-case specs — metadata only (Fix 02.5.3).
 *
 * **Purpose:** Document potential trigger pair conflicts for Conflict Resolver scaffold.
 * **Does NOT** describe winners, losers, priority override, state, or transitions.
 *
 * Catalog `TRIGGER_EDGE_CASE_SPECS` remains documentation for Task 02.4.1.
 * Conflict Resolver reads **only** this module — no decision fields.
 *
 * @module entryStateManager/conflictEdgeCaseSpecs
 */

import { EntryTriggerKind } from './evaluationTypes';

/** Traceability metadata — no resolution semantics. */
export interface ConflictEdgeCaseMetadata {
  /** Source edge id from Task 02.4.1 documentation catalog. */
  sourceEdgeId: string;
}

/**
 * Conflict edge-case row — edgeId, involved triggers, description, metadata only.
 */
export interface ConflictEdgeCaseSpec {
  edgeId: string;
  involvedKinds: readonly EntryTriggerKind[];
  description: string;
  metadata: ConflictEdgeCaseMetadata;
}

/**
 * Deterministic conflict edge cases for Task 02.5.3 grouping.
 *
 * `edgeId` format: `CONFLICT-EDGE-{NNN}` — stable for identical input.
 */
export const CONFLICT_EDGE_CASE_SPECS: readonly ConflictEdgeCaseSpec[] = [
  {
    edgeId: 'CONFLICT-EDGE-001',
    involvedKinds: [EntryTriggerKind.HardBlock, EntryTriggerKind.Confirmation],
    description: 'Potential conflict only.',
    metadata: { sourceEdgeId: 'EDGE-001' },
  },
  {
    edgeId: 'CONFLICT-EDGE-002',
    involvedKinds: [EntryTriggerKind.Unlock, EntryTriggerKind.Noise],
    description: 'Potential conflict only.',
    metadata: { sourceEdgeId: 'EDGE-002' },
  },
  {
    edgeId: 'CONFLICT-EDGE-003',
    involvedKinds: [EntryTriggerKind.Recovery, EntryTriggerKind.HardBlock],
    description: 'Potential conflict only.',
    metadata: { sourceEdgeId: 'EDGE-003' },
  },
  {
    edgeId: 'CONFLICT-EDGE-005',
    involvedKinds: [EntryTriggerKind.Recovery, EntryTriggerKind.Unlock],
    description: 'Potential conflict only.',
    metadata: { sourceEdgeId: 'EDGE-005' },
  },
] as const;

/** Build deterministic same-priority conflict group id. */
export function samePriorityConflictGroupId(priority: number): string {
  return `CONFLICT-SAME-PRIORITY-${priority}`;
}
