/**
 * Entry transition type definitions — RuleBook V2 §2 + Task 02.2.2.2 metadata.
 *
 * **Purpose:** Data shapes for the transition matrix (no runtime evaluation).
 * **Used by:** Audit, Trade Journal, Export, AI rule validation (future).
 * **Do not use in:** Production scan path or if/else transition handlers.
 *
 * @module entryStateManager/transitionTypes
 */

import type { EntryState } from './enums';
import type {
  TransitionAuditLabel,
  TransitionCategory,
  TransitionSourceModule,
} from './transitionMetadata';

/** Stable transition identifier — format `ESM-T-{FROM}-{TO}`. */
export type EntryTransitionId = `ESM-T-${EntryState}-${EntryState}`;

/**
 * One directed edge in the ESM transition matrix.
 *
 * Contains full audit metadata (Task 02.2.2.2). **No algorithms** — data only.
 * `allowed: false` = structurally invalid per Business Workflow 02.2.2.1.
 */
export interface EntryTransitionDefinition {
  transitionId: EntryTransitionId;
  fromState: EntryState;
  toState: EntryState;
  /** Human-readable reason for audit / journal / export. */
  transitionReason: string;
  transitionCategory: TransitionCategory;
  /** Metadata priority only — not used for runtime resolution. */
  priority: number;
  /** Declared source — never invoked at scaffold stage. */
  sourceModule: TransitionSourceModule;
  auditLabel: TransitionAuditLabel;
  ruleReference: string;
  /** Structurally permitted (Business Workflow 02.2.2.1). */
  allowed: boolean;
  /** Technical summary. */
  description: string;
  /** Business rationale. */
  businessDescription: string;
  /** Future state-machine condition key — no logic yet. */
  futureConditionPlaceholder: string;
}

/**
 * Global or conditional prohibition on **allowed** edges — RuleBook §2.3 / §1.x.
 */
export interface EntryTransitionConstraint {
  id: string;
  appliesTo: readonly EntryTransitionId[];
  ruleReference: string;
  description: string;
  futureConditionPlaceholder: string;
}

/** Result of static data validation on the transition matrix. */
export interface TransitionMatrixValidationResult {
  valid: boolean;
  errors: readonly string[];
}

/** Tabular export shape for audit / GPT validation. */
export interface EntryTransitionMetadataRow {
  transitionId: EntryTransitionId;
  fromState: EntryState;
  toState: EntryState;
  allowed: boolean;
  transitionReason: string;
  transitionCategory: TransitionCategory;
  priority: number;
  sourceModule: TransitionSourceModule;
  auditLabel: TransitionAuditLabel;
  ruleReference: string;
}
