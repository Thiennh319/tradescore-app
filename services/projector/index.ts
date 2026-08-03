/**
 * Task 12B.3 — Projector public API.
 */

export {
  materializeAiTradeJournalEntry,
  project,
  projectFromStored,
  projectTradeState,
  projectWithState,
  sortTradeEventsForProjection,
  stableSerializeJournalEntry,
} from './tradeProjector';

export { reduceTradeEvent } from './tradeProjectionReducer';

export {
  cloneProjectionState,
  createEmptyProjectionState,
} from './tradeProjectionState';

export type {
  ProjectOptions,
  ProjectResult,
  ProjectionAdviserStep,
  ProjectionAiMeta,
  ProjectionAuditState,
  ProjectionExitState,
  ProjectionLifecyclePhase,
  ProjectionMachineCodes,
  ProjectionPositionState,
  TradeProjectionState,
} from './tradeProjectorTypes';

export {
  TRADE_PROJECTION_SCHEMA_VERSION,
  TRADE_PROJECTION_VERSION,
  type TradeProjectionSchemaVersion,
  type TradeProjectionVersion,
} from './tradeProjectionVersion';
