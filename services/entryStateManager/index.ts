/**
 * Entry State Manager (ESM) — public API.
 *
 * **Purpose:** Barrel export for types, enums, metadata, and error taxonomy.
 * **Used by:** Integration tasks (`signalBoardScan`, export, store bridge).
 * **Do not use in:** Production scan path until {@link FEATURE_FLAG} is wired.
 *
 * Scaffold — types, metadata, transition matrix data. ESM Core v1.5.0 (frozen) + integration v1.9.0.
 * Position Adviser Integration v1.9.0 (frozen after Task 02.8.4).
 * Entry State Mapping Bridge v2.0.0 (frozen after Task 02.9.0).
 *
 * @module entryStateManager
 * @see RuleBook V2.0.0 (LOCKED)
 * @see ./README.md
 */

export {
  EntryStateMapping,
  EntryStateMappingError,
  EntryStateMappingErrorCode,
  FINAL_ENTRY_STATUS_TO_RULEBOOK_MAP,
  FINAL_ENTRY_STATUS_TO_RULEBOOK_ROWS,
  RULEBOOK_NOT_YET_MAPPED_TO_FINAL,
  RULEBOOK_TO_STATE_MACHINE_MAP,
  RULEBOOK_TO_STATE_MACHINE_ROWS,
  STATE_MACHINE_NOT_YET_MAPPED_TO_RULEBOOK,
  isFinalEntryStatus,
  isRuleBookEntryState,
  isMappingStateMachineEntryState,
  mapEntryStateToStateMachine,
  mapFinalEntryStatusToEntryState,
  mapFinalEntryStatusToStateMachine,
  mapStateMachineToEntryState,
  validateEntryStateMapping,
} from './entryStateMapping';

export type {
  EntryStateMappingRow,
  EntryStateMappingValidationResult,
  EntryStateNotYetMappedReason,
  MappedFinalEntryStatus,
  MappedRuleBookEntryState,
  MappedStateMachineEntryState,
} from './entryStateMappingTypes';

export type { FinalEntryStatus as ProductionFinalEntryStatus } from './entryStateMappingTypes';

export {
  ENTRY_STATE_DEFINITIONS,
  ENTRY_STATE_IDS,
  isEntryState,
} from './entryStateMetadata';
export type { EntryStateDefinition } from './entryStateMetadata';

export {
  ENTRY_ALLOWED_TRANSITIONS,
  ENTRY_FORBIDDEN_TRANSITIONS,
  ENTRY_SKIP_WATCH_FORBIDDEN_PAIRS,
  ENTRY_TRANSITION_CONSTRAINTS,
  ENTRY_TRANSITION_LOOKUP,
  ENTRY_TRANSITION_MATRIX,
  ENTRY_TRANSITION_METADATA_TABLE,
  entryTransitionId,
} from './transitionMatrix';

export {
  TRANSITION_CATEGORY_PRIORITY,
  TRANSITION_SOURCE_MODULES,
  TransitionAuditLabel,
  TransitionCategory,
} from './transitionMetadata';
export type { TransitionSourceModule } from './transitionMetadata';

export {
  DETECTION_LAYER_API_STATUS,
  DETECTION_LAYER_FROZEN_DATE,
  DETECTION_LAYER_FROZEN_DETECTORS,
  DETECTION_LAYER_FROZEN_VERSION,
} from './detectionLayerFreeze';

export type { DetectionLayerFrozenDetector } from './detectionLayerFreeze';

export {
  ORIGIN_RULE_ID_PATTERNS,
  isValidAnyEsmOriginRuleId,
  isValidOriginRuleId,
} from './originRuleIdValidation';

export type { OriginRuleIdFamily } from './originRuleIdValidation';

export {
  TriggerAggregator,
  aggregateTriggers,
  validateTriggerAggregatorContext,
} from './triggerAggregator';

export type {
  TriggerAggregateResult,
  TriggerAggregatorContext,
  TriggerAggregatorContextValidationResult,
} from './triggerAggregatorTypes';

export {
  PriorityResolver,
  resolvePriority,
  validatePriorityResolverContext,
} from './priorityResolver';

export type {
  PriorityGroupEntryPlaceholder,
  PriorityGroupPlaceholder,
  PriorityResolverContext,
  PriorityResolverContextValidationResult,
  PriorityResolverResult,
  PriorityResolverSlotKey,
} from './priorityResolverTypes';

export {
  ConflictResolver,
  detectPotentialConflicts,
  resolveConflictGroup,
  resolveConflicts,
  validateConflictResolverContext,
} from './conflictResolver';

export {
  CONFLICT_POLICY,
  CONFLICT_RESOLUTION_POLICY,
} from './conflictResolutionPolicy';

export type {
  CatalogPriorityResolutionOutcome,
  ConflictResolutionPolicy,
} from './conflictResolutionPolicy';

export type {
  ConflictAnalysisEntry,
  ConflictGroupMemberPlaceholder,
  ConflictGroupPlaceholder,
  ConflictKind,
  ConflictResolverContext,
  ConflictResolverContextValidationResult,
  ConflictResolverResult,
  ResolvedConflict,
} from './conflictResolverTypes';

export {
  ConflictResolutionMethod,
  ConflictResolutionStatus,
} from './conflictResolverTypes';

export {
  DecisionEngine,
  buildDecisionEngineResult,
  collectDecisionCandidates,
  validateDecisionEngineContext,
  validateDecisionEngineResult,
} from './decisionEngine';

export type {
  DecisionCandidate,
  DecisionEngineContext,
  DecisionEngineContextValidationResult,
  DecisionEngineResult,
  DecisionEngineResultValidationResult,
} from './decisionEngineTypes';

export { DecisionCandidateStatus } from './decisionEngineTypes';

export {
  FinalDecisionEngine,
  buildFinalDecisionResult,
  collectEligibleCandidates,
  validateFinalDecisionContext,
  validateFinalDecisionResult,
} from './finalDecisionEngine';

export type {
  FinalDecision,
  FinalDecisionContext,
  FinalDecisionContextValidationResult,
  FinalDecisionResult,
  FinalDecisionResultValidationResult,
} from './finalDecisionTypes';

export {
  EntryStateMachine,
  buildAvailableTransitions,
  buildEntryStateMachineResult,
  isStateMachineEntryState,
  resolveNextState,
  validateEntryStateMachineContext,
  validateEntryStateMachineResult,
} from './stateMachine';

export type { ResolvedNextState } from './stateMachine';

export {
  TRANSITION_POLICY,
  getPolicyTransitionReason,
  listPolicyTransitionTargets,
} from './transitionPolicy';

export type { TransitionPolicy } from './transitionPolicy';

export type {
  AvailableTransition,
  EntryStateMachineContext,
  EntryStateMachineContextValidationResult,
  EntryStateMachineResult,
  EntryStateMachineResultValidationResult,
} from './stateMachineTypes';

export { EntryState as StateMachineEntryState } from './stateMachineTypes';

export {
  ActionEngine,
  buildActionEngineResult,
  buildActionId,
  collectActions,
  isEntryActionType,
  validateActionEngineContext,
  validateActionEngineResult,
} from './actionEngine';

export type {
  ActionEngineContext,
  ActionEngineContextValidationResult,
  ActionEngineResult,
  ActionEngineResultValidationResult,
  EntryAction,
  ActionPolicyMetadata,
} from './actionTypes';

export { EntryActionType } from './actionTypes';

export { ACTION_POLICY } from './actionPolicy';

export type { ActionPolicy } from './actionPolicy';

export {
  ActionRuntime,
  buildActionRuntimeResult,
  buildRuntimeActions,
  isRuntimeActionStatus,
  validateActionRuntimeContext,
  validateActionRuntimeResult,
} from './actionRuntime';

export type {
  ActionRuntimeContext,
  ActionRuntimeContextValidationResult,
  ActionRuntimeResult,
  ActionRuntimeResultValidationResult,
  RuntimeAction,
  RuntimeActionMetadata,
} from './actionRuntimeTypes';

export { RuntimeActionStatus } from './actionRuntimeTypes';

export {
  RuntimeDispatcher,
  buildDispatchId,
  buildDispatchPlan,
  buildRuntimeDispatcherResult,
  isRuntimeDispatchStatus,
  validateRuntimeDispatcherContext,
  validateRuntimeDispatcherResult,
} from './runtimeDispatcher';

export type {
  RuntimeDispatchItem,
  RuntimeDispatchMetadata,
  RuntimeDispatcherContext,
  RuntimeDispatcherContextValidationResult,
  RuntimeDispatcherResult,
  RuntimeDispatcherResultValidationResult,
} from './runtimeDispatcherTypes';

export { RuntimeDispatchStatus } from './runtimeDispatcherTypes';

export {
  RuntimeExecutor,
  buildExecutionId,
  buildExecutionPlan,
  buildRuntimeExecutorResult,
  isRuntimeExecutionStatus,
  validateRuntimeExecutorContext,
  validateRuntimeExecutorResult,
} from './runtimeExecutor';

export type {
  RuntimeExecutionItem,
  RuntimeExecutionMetadata,
  RuntimeExecutorContext,
  RuntimeExecutorContextValidationResult,
  RuntimeExecutorResult,
  RuntimeExecutorResultValidationResult,
} from './runtimeExecutorTypes';

export { RuntimeExecutionStatus } from './runtimeExecutorTypes';

export {
  PositionAdviserWiring,
  isPositionAdviserEnabled,
  runPositionAdviserPipeline,
  validatePositionAdviserWiringContext,
  validatePositionAdviserWiringResult,
} from './positionAdviserWiring';

export type {
  PositionAdviserWiringContext,
  PositionAdviserWiringContextValidationResult,
  PositionAdviserWiringResultValidationResult,
} from './positionAdviserWiring';

export {
  PositionAdviserIntegrationHarness,
  buildPositionAdviserHarnessFromIntegration,
  buildPositionAdviserHarnessResult,
  validatePositionAdviserHarnessContext,
  validatePositionAdviserHarnessResult,
} from './positionAdviserHarness';

export type {
  PositionAdviserHarnessContext,
  PositionAdviserHarnessContextValidationResult,
  PositionAdviserHarnessIntegrationSource,
  PositionAdviserHarnessResult,
  PositionAdviserHarnessResultValidationResult,
} from './positionAdviserHarnessTypes';

export {
  PositionAdviserAdapter,
  buildPositionAdviserAdapterResult,
  validatePositionAdviserAdapterContext,
  validatePositionAdviserAdapterResult,
} from './positionAdviserAdapter';

export type {
  PositionAdviserActionItem,
  PositionAdviserActionSummary,
  PositionAdviserAdapterContext,
  PositionAdviserAdapterContextValidationResult,
  PositionAdviserAdapterResult,
  PositionAdviserAdapterResultValidationResult,
  PositionAdviserDecisionSummary,
  PositionAdviserInput,
  PositionAdviserRuntimeItem,
  PositionAdviserRuntimeSummary,
  PositionAdviserStateSummary,
} from './positionAdviserAdapterTypes';

export {
  SignalBoardWiring,
  DEFAULT_ENTRY_STATE_MANAGER_ENABLED,
  isEntryStateManagerEnabled,
  runEntryStateManagerPipeline,
  validateSignalBoardWiringContext,
  validateSignalBoardWiringResult,
} from './signalBoardWiring';

export type {
  SignalBoardWiringContext,
  SignalBoardWiringContextValidationResult,
  SignalBoardWiringResultValidationResult,
} from './signalBoardWiring';

export {
  IntegrationHarness,
  buildIntegrationHarnessResult,
  validateIntegrationHarnessContext,
  validateIntegrationHarnessResult,
} from './integrationHarness';

export type {
  IntegrationHarnessContext,
  IntegrationHarnessContextValidationResult,
  IntegrationHarnessResult,
  IntegrationHarnessResultValidationResult,
} from './integrationHarnessTypes';

export {
  PipelineOrchestrator,
  buildPipelineOrchestratorResult,
  validatePipelineOrchestratorContext,
  validatePipelineOrchestratorResult,
  ORCHESTRATOR_DEFAULT_CURRENT_STATE,
} from './pipelineOrchestrator';

export type {
  PipelineOrchestratorContext,
  PipelineOrchestratorContextValidationResult,
  PipelineOrchestratorResult,
  PipelineOrchestratorResultValidationResult,
} from './pipelineOrchestratorTypes';

export {
  SignalBoardAdapter,
  buildSignalBoardAdapterResult,
  validateSignalBoardAdapterContext,
  validateSignalBoardAdapterResult,
} from './signalBoardAdapter';

export type {
  SignalBoardAdapterContext,
  SignalBoardAdapterContextValidationResult,
  SignalBoardAdapterResult,
  SignalBoardAdapterResultValidationResult,
  SignalBoardScanSnapshot,
  SignalBoardTriggerSnapshot,
} from './signalBoardAdapterTypes';

export {
  isRecord,
  validateFieldMatch,
  validateHaltedCountConsistency,
  validateRequiredBoolean,
  validateRequiredNonEmptyString,
  validateSequentialOrdersFromOne,
  validateUniqueNumericValues,
  validateUniqueValues,
} from './pipelineValidationUtils';

export {
  HardBlockDetectionEngine,
  detectHardBlock,
  ruleEngineOutputFromManagerInput,
  validateHardBlockDetectionContext,
  validateHardBlockDetectionResult,
} from './hardBlockDetectionEngine';

export {
  buildHardBlockEvidenceFromRuleOutput,
  dedupeHardBlockEvidence,
} from './hardBlockEvidenceBuilder';

export {
  HARDBLOCK_FLAG_ORIGIN_IDS,
  isValidHardBlockOriginRuleId,
  resolveHardBlockOriginRuleId,
} from './hardBlockOriginRuleId';

export {
  normalizeRuleOutput,
  normalizeRuleOutputFromManagerInput,
} from './normalizedRuleOutput';

export type {
  NormalizedRuleOutput,
  NormalizedRuleOutputInput,
} from './normalizedRuleOutput';

export type {
  HardBlockContextValidationResult,
  HardBlockDetectionContext,
  HardBlockDetectionResult,
  HardBlockDetectionValidationResult,
  HardBlockEvidence,
  HardBlockEvidenceKind,
  HardBlockRuleEngineOutput,
} from './hardBlockDetectionTypes';

export {
  NoiseDetectionEngine,
  detectNoise,
  validateNoiseDetectionContext,
  validateNoiseDetectionResult,
} from './noiseDetectionEngine';

export {
  buildNoiseEvidenceFromSignalSnapshot,
  dedupeNoiseEvidence,
} from './noiseEvidenceBuilder';

export { isValidNoiseOriginRuleId } from './noiseOriginRuleId';

export {
  NOISE_EVIDENCE_KINDS,
  NOISE_EVIDENCE_KIND_DESCRIPTIONS,
} from './noiseEvidenceKinds';

export type { NoiseEvidenceKind } from './noiseEvidenceKinds';

export {
  NOISE_KIND_TO_SIGNAL_SLOT,
  adaptNoiseSignals,
  adaptNoiseSignalsFromContext,
  createEmptyNoiseSignalSnapshot,
} from './noiseSignalAdapter';

export type {
  NoiseSignalAdapterInput,
  NoiseSignalSnapshot,
} from './noiseSignalAdapter';

export type {
  NoiseContextValidationResult,
  NoiseDetectionContext,
  NoiseDetectionResult,
  NoiseDetectionValidationResult,
  NoiseEvidence,
} from './noiseDetectionTypes';

export {
  ConfirmationDetectionEngine,
  detectConfirmation,
  validateConfirmationDetectionContext,
  validateConfirmationDetectionResult,
} from './confirmationDetectionEngine';

export {
  buildConfirmationEvidenceFromSignalSnapshot,
  dedupeConfirmationEvidence,
} from './confirmationEvidenceBuilder';

export { isValidConfirmationOriginRuleId } from './confirmationOriginRuleId';

export {
  CONFIRMATION_EVIDENCE_KINDS,
  CONFIRMATION_EVIDENCE_KIND_DESCRIPTIONS,
} from './confirmationEvidenceKinds';

export type { ConfirmationEvidenceKind } from './confirmationEvidenceKinds';

export {
  CONFIRMATION_KIND_TO_SIGNAL_SLOT,
  adaptConfirmationSignals,
  adaptConfirmationSignalsFromContext,
  createEmptyConfirmationSignalSnapshot,
} from './confirmationSignalAdapter';

export type {
  ConfirmationSignalAdapterInput,
  ConfirmationSignalSnapshot,
} from './confirmationSignalAdapter';

export type {
  ConfirmationContextValidationResult,
  ConfirmationDetectionContext,
  ConfirmationDetectionResult,
  ConfirmationDetectionValidationResult,
  ConfirmationEvidence,
} from './confirmationDetectionTypes';

export {
  RecoveryDetectionEngine,
  detectRecovery,
  validateRecoveryDetectionContext,
  validateRecoveryDetectionResult,
} from './recoveryDetectionEngine';

export {
  buildRecoveryEvidenceFromSignalSnapshot,
  dedupeRecoveryEvidence,
} from './recoveryEvidenceBuilder';

export { isValidRecoveryOriginRuleId } from './recoveryOriginRuleId';

export {
  RECOVERY_EVIDENCE_KINDS,
  RECOVERY_EVIDENCE_KIND_DESCRIPTIONS,
} from './recoveryEvidenceKinds';

export type { RecoveryEvidenceKind } from './recoveryEvidenceKinds';

export {
  RECOVERY_KIND_TO_SIGNAL_SLOT,
  adaptRecoverySignals,
  adaptRecoverySignalsFromContext,
  createEmptyRecoverySignalSnapshot,
} from './recoverySignalAdapter';

export type {
  RecoverySignalAdapterInput,
  RecoverySignalSnapshot,
} from './recoverySignalAdapter';

export type {
  RecoveryContextValidationResult,
  RecoveryDetectionContext,
  RecoveryDetectionResult,
  RecoveryDetectionValidationResult,
  RecoveryEvidence,
} from './recoveryDetectionTypes';

export {
  UnlockDetectionEngine,
  detectUnlock,
  validateUnlockDetectionContext,
  validateUnlockDetectionResult,
} from './unlockDetectionEngine';

export {
  buildUnlockEvidenceFromSignalSnapshot,
  dedupeUnlockEvidence,
} from './unlockEvidenceBuilder';

export { isValidUnlockOriginRuleId } from './unlockOriginRuleId';

export {
  UNLOCK_EVIDENCE_KINDS,
  UNLOCK_EVIDENCE_KIND_DESCRIPTIONS,
} from './unlockEvidenceKinds';

export type { UnlockEvidenceKind } from './unlockEvidenceKinds';

export {
  UNLOCK_KIND_TO_SIGNAL_SLOT,
  adaptUnlockSignals,
  adaptUnlockSignalsFromContext,
  createEmptyUnlockSignalSnapshot,
} from './unlockSignalAdapter';

export type {
  UnlockSignalAdapterInput,
  UnlockSignalSnapshot,
} from './unlockSignalAdapter';

export type {
  UnlockContextValidationResult,
  UnlockDetectionContext,
  UnlockDetectionResult,
  UnlockDetectionValidationResult,
  UnlockEvidence,
} from './unlockDetectionTypes';

export {
  EntryStateValidator,
  validateEntryState,
  validateTransition,
  validateTransitionMetadata,
} from './stateValidator';

export {
  validationFailure,
  validationSuccess,
} from './validationResult';
export type { EntryStateValidationResult } from './validationResult';

export {
  ENTRY_STATE_EVALUATION_NEXT_STEP_PLACEHOLDER,
  ENTRY_STATE_EVALUATION_PIPELINE_DIAGRAM,
  ENTRY_STATE_EVALUATION_PIPELINE_STEPS,
  ENTRY_TRIGGER_KIND_CATEGORY_MAP,
} from './evaluationPipeline';
export type { EntryStateEvaluationPipelineStepSpec } from './evaluationPipeline';

export type {
  EntryStateEvaluationContext,
  EntryStateEvaluationResult,
  EntryStateMarketSnapshot,
  EntryStateNextStepPlaceholder,
  EntryStateSignalSnapshot,
  EntryTransitionCandidate,
  EntryTrigger,
} from './evaluationTypes';
export { EntryStateEvaluationStep, EntryTriggerKind } from './evaluationTypes';

export {
  TriggerDetectionEngine,
  createEmptyTriggerDetectionResult,
  TRIGGER_DETECTION_NOT_IMPLEMENTED_MESSAGE,
} from './triggerDetectionEngine';

export {
  TRIGGER_EDGE_CASE_SPECS,
  TRIGGER_FAILURE_SCENARIO_SPECS,
  TRIGGER_TYPE_CATALOG,
  TRIGGER_TYPE_CATALOG_LIST,
  triggerTypeId,
  validateTriggerCatalog,
} from './triggerDetectionCatalog';

export type {
  DetectedTrigger,
  TriggerDetectionContext,
  TriggerDetectionResult,
  TriggerDetectionRuleSnapshotPlaceholder,
  TriggerEdgeCaseSpec,
  TriggerFailureScenarioSpec,
  TriggerTypeDefinition,
  TriggerTypeId,
} from './triggerDetectionTypes';

export {
  findTransitionDefinition,
  isStructurallyAllowed,
  validateTransitionMatrixData,
} from './transitionValidation';

export type {
  EntryTransitionConstraint,
  EntryTransitionDefinition,
  EntryTransitionId,
  EntryTransitionMetadataRow,
  TransitionMatrixValidationResult,
} from './transitionTypes';

export {
  AUDIT_VERSION,
  DEFAULT_POSITION_ADVISER_ENABLED,
  ESM_MODULE_METADATA,
  FEATURE_FLAG,
  MODULE_NAME,
  MODULE_VERSION,
  POSITION_ADVISER_FEATURE_FLAG,
  POSITION_ADVISER_INTEGRATION_FROZEN_VERSION,
  ENTRY_STATE_MAPPING_FROZEN_VERSION,
  RULEBOOK_VERSION,
} from './metadata';
export type { EsmModuleMetadata } from './metadata';

export {
  ESM_AUDIT_VERSION,
  ESM_DEFAULT_HYSTERESIS_CONFIG,
  ESM_DEFAULT_LOCK_ZONE_CONFIG,
  ESM_FEATURE_FLAG_KEY,
  ESM_MODULE_VERSION,
  ESM_RULEBOOK_VERSION,
} from './constants';

export {
  EntryState,
  EsmDirection,
  EsmScorerVersion,
  HardBlockPriority,
  LockStatus,
  LockZoneMode,
} from './enums';

export { ESM_ERROR_CODE_LABELS, EsmErrorCode } from './errorCodes';

export type {
  EntryLockZoneBounds,
  EntryStateManagerConfig,
  EntryStateManagerInput,
  EntryStateRecord,
  EntryStateSnapshot,
  EntryStateTransitionLabel,
  HysteresisConfig,
  HysteresisCounters,
  LockZoneConfig,
} from './types';

export type {
  EntryStateAuditFields,
  EntryStateAuditSection,
  EntryStateAuditSupplement,
} from './audit';

export type {
  HardBlockCriticalId,
  HardBlockHighId,
  HardBlockLowId,
  HardBlockMediumId,
  HardBlockTaxonomyId,
} from './hardBlockIds';
