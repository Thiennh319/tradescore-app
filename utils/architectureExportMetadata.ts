/**
 * Architecture export metadata — presentation SSOT (UL-03.2).
 *
 * **Purpose:** Version matrix + feature-flag labels for AI Review export.
 * **Must NOT:** Modify frozen modules or runtime flag values.
 *
 * @module utils/architectureExportMetadata
 */

import { BUILD_INFO } from '../constants/buildInfo';
import { FEATURE_FLAGS, isEntryStateManagerEnabled } from '../config/featureFlags';
import {
  DEFAULT_POSITION_ADVISER_ENABLED,
  ENTRY_STATE_MAPPING_FROZEN_VERSION,
  ESM_MODULE_METADATA,
  FEATURE_FLAG,
  MODULE_VERSION,
  POSITION_ADVISER_FEATURE_FLAG,
  POSITION_ADVISER_INTEGRATION_FROZEN_VERSION,
} from '../services/entryStateManager/metadata';
import { DETECTION_LAYER_FROZEN_VERSION } from '../services/entryStateManager/detectionLayerFreeze';
import { PRODUCTION_ESM_BRIDGE_VERSION } from '../services/productionEsmBridge/productionEsmBridgeTypes';
import { ESM_STORE_BRIDGE_VERSION } from '../store/esmBridgeTypes';
import type { EsmBridgeState } from '../store/esmBridgeTypes';

/** UI presentation layer — UL-03.2 hint priority + export metadata. */
export const UI_LAYER_VERSION = 'UL-03.2' as const;

/**
 * Frozen ESM pipeline ordering baseline (Task 02.6.7).
 * MODULE_VERSION tracks mapping bridge; pipeline freeze remains 1.5.0 per architecture docs.
 */
export const ESM_PIPELINE_FROZEN_VERSION = '1.5.0' as const;

export const RULEBOOK_FEATURE_FLAG = 'RULEBOOK_ENABLED' as const;
export const AI_JOURNAL_FEATURE_FLAG = 'AI_JOURNAL_ENABLED' as const;

export interface RuntimeFeatureFlagSnapshot {
  readonly entryStateManagerEnabled: boolean;
  readonly positionAdviserEnabled: boolean;
  readonly rulebookEnabled: boolean;
  readonly aiJournalEnabled: boolean;
}

export interface ArchitectureVersionMatrix {
  readonly tradeScoreVersion: string;
  readonly esmVersion: string;
  readonly detectionLayerVersion: string;
  readonly pipelineVersion: string;
  readonly positionAdviserVersion: string;
  readonly mappingBridgeVersion: string;
  readonly productionBridgeVersion: string;
  readonly storeBridgeVersion: string;
  readonly uiLayerVersion: string;
  readonly buildDate: string;
}

function formatMatrixLine(label: string, version: string, labelWidth = 22): string {
  const pad = Math.max(1, labelWidth - label.length);
  return `${label}${'.'.repeat(pad)}${version}`;
}

/** Read-only version matrix from existing module metadata. */
export function buildArchitectureVersionMatrix(
  generatedAt: string,
): ArchitectureVersionMatrix {
  const buildDate =
    BUILD_INFO.buildDate ||
    generatedAt.slice(0, 10);

  return {
    tradeScoreVersion: BUILD_INFO.version,
    esmVersion: MODULE_VERSION,
    detectionLayerVersion: DETECTION_LAYER_FROZEN_VERSION,
    pipelineVersion: ESM_PIPELINE_FROZEN_VERSION,
    positionAdviserVersion: POSITION_ADVISER_INTEGRATION_FROZEN_VERSION,
    mappingBridgeVersion: ENTRY_STATE_MAPPING_FROZEN_VERSION,
    productionBridgeVersion: PRODUCTION_ESM_BRIDGE_VERSION,
    storeBridgeVersion: ESM_STORE_BRIDGE_VERSION,
    uiLayerVersion: UI_LAYER_VERSION,
    buildDate,
  };
}

export function formatArchitectureVersionMatrix(matrix: ArchitectureVersionMatrix): string {
  return [
    formatMatrixLine('TradeScore Version', matrix.tradeScoreVersion),
    formatMatrixLine('ESM Version', matrix.esmVersion),
    formatMatrixLine('Detection Layer', matrix.detectionLayerVersion),
    formatMatrixLine('Pipeline', matrix.pipelineVersion),
    formatMatrixLine('Position Adviser', matrix.positionAdviserVersion),
    formatMatrixLine('Mapping Bridge', matrix.mappingBridgeVersion),
    formatMatrixLine('Production Bridge', matrix.productionBridgeVersion),
    formatMatrixLine('Store Bridge', matrix.storeBridgeVersion),
    formatMatrixLine('UI Layer', matrix.uiLayerVersion),
    formatMatrixLine('Build Date', matrix.buildDate),
    '',
    `_RuleBook: ${ESM_MODULE_METADATA.rulebookVersion}_`,
  ].join('\n');
}

function formatFlagLine(name: string, enabled: boolean): string {
  return `${name}..........${enabled ? 'ON' : 'OFF'}`;
}

/** Read runtime flag state — does not mutate flags. */
export function resolveRuntimeFeatureFlags(input: {
  esmBridge: EsmBridgeState;
  journalEntryCount: number;
}): RuntimeFeatureFlagSnapshot {
  const esmRuntime =
    isEntryStateManagerEnabled() ||
    input.esmBridge.enabled ||
    Object.values(input.esmBridge.snapshotBySymbol).some(
      (s) => s.entryStateManagerEnabled === true,
    );

  return {
    entryStateManagerEnabled: esmRuntime,
    positionAdviserEnabled: DEFAULT_POSITION_ADVISER_ENABLED,
    rulebookEnabled: true,
    aiJournalEnabled: input.journalEntryCount >= 0,
  };
}

export function formatFeatureFlagSummary(flags: RuntimeFeatureFlagSnapshot): string {
  return [
    formatFlagLine(FEATURE_FLAG, flags.entryStateManagerEnabled),
    formatFlagLine(POSITION_ADVISER_FEATURE_FLAG, flags.positionAdviserEnabled),
    formatFlagLine(RULEBOOK_FEATURE_FLAG, flags.rulebookEnabled),
    formatFlagLine(AI_JOURNAL_FEATURE_FLAG, flags.aiJournalEnabled),
    '',
    `_TP_PROBABILITY_FILTER: ${FEATURE_FLAGS.TP_PROBABILITY_FILTER ? 'ON' : 'OFF'}_`,
  ].join('\n');
}
