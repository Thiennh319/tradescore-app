/**
 * Production → ESM Bridge — public barrel (UL-01).
 *
 * @module productionEsmBridge
 */

export {
  ProductionEsmBridge,
  runProductionEsmBridge,
  validateProductionEsmBridgeInput,
  validateProductionEsmBridgeSnapshot,
} from './productionEsmBridge';

export { SignalRowMapper, mapSignalRowToWiringContext, ProductionEsmBridgeMapperError } from './signalRowMapper';

export {
  TriggerSnapshotFactory,
  CANONICAL_EMPTY_TRIGGER_SNAPSHOT,
  createEmptyTriggerSnapshot,
} from './triggerSnapshotFactory';

export {
  EsmStoreBridge,
  buildEsmBridgeStorePatch,
  writeEsmSnapshotToStore,
  writeEsmSnapshotToStoreIfChanged,
} from './esmStoreBridge';

export {
  ProductionEsmScanWiring,
  wireProductionEsmAfterScan,
} from './productionEsmScanWiring';

export {
  resolveEligibleEsmSymbols,
  isEsmSymbolEligible,
} from './productionEsmSymbolFilter';

export { PRODUCTION_ESM_SCAN_WIRING_VERSION } from './productionEsmScanWiring';

export type {
  EsmScanWiringStoreContext,
  EsmScanWiringTiming,
  EsmScanWiringBenchmark,
} from './productionEsmScanWiring';

export type { EsmSnapshotStoreReader, EsmSnapshotStoreWriter, WriteEsmSnapshotOptions } from './esmStoreBridge';

export { PRODUCTION_ESM_BRIDGE_VERSION } from './productionEsmBridgeTypes';

export type {
  ProductionEsmBridgeInput,
  ProductionEsmBridgeInputValidationResult,
  ProductionEsmBridgeSnapshot,
  ProductionEsmBridgeSnapshotValidationResult,
} from './productionEsmBridgeTypes';
