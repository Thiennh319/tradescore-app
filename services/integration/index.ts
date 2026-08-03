/**
 * Task 12B.4–12B.5 — Trading Intelligence Integration public API.
 */

export {
  DualWriteCoordinator,
  createInMemoryJournalViewWriter,
} from './dualWriteCoordinator';

export {
  JournalEventPublisher,
  createJournalEventPublisher,
} from './journalEventPublisher';

export {
  MemoryProjectionCache,
  createProjectionCache,
  type IProjectionCache,
  type ProjectionCacheStats,
} from './projectionCache';

export {
  ProjectionReader,
  createProjectionReader,
  type ProjectionReadResult,
  type ProjectionReadSource,
  type ProjectionReaderOptions,
} from './projectionReader';

export {
  DirectJournalWriteForbiddenError,
  FlippedTradingIntelligence,
  RULE_29_PROJECTOR_TRANSLATE_ONLY,
  createFlippedTradingIntelligence,
  type FlipRecoveryResult,
  type FlipSourceOfTruthOptions,
  type FlipWriteResult,
} from './flipSourceOfTruth';

export type {
  DualWriteCoordinatorOptions,
  DualWriteMismatch,
  DualWriteResult,
  DualWriteStatus,
  JournalViewWriter,
  ProjectionDebugMetadata,
  PublishTradeEventInput,
} from './dualWriteTypes';
