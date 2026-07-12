/**
 * Architecture export metadata — tests (UL-03.2).
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_ESM_BRIDGE_STATE } from '../store/esmBridgeTypes';
import {
  UI_LAYER_VERSION,
  buildArchitectureVersionMatrix,
  formatArchitectureVersionMatrix,
  formatFeatureFlagSummary,
  resolveRuntimeFeatureFlags,
} from './architectureExportMetadata';

describe('architectureExportMetadata — UL-03.2', () => {
  it('builds version matrix from module metadata', () => {
    const matrix = buildArchitectureVersionMatrix('2026-07-12T15:00:00.000Z');
    expect(matrix.tradeScoreVersion).toBe('1.0.5');
    expect(matrix.esmVersion).toBe('2.0.0');
    expect(matrix.detectionLayerVersion).toBe('0.6.2');
    expect(matrix.pipelineVersion).toBe('1.5.0');
    expect(matrix.positionAdviserVersion).toBe('1.9.0');
    expect(matrix.mappingBridgeVersion).toBe('2.0.0');
    expect(matrix.uiLayerVersion).toBe(UI_LAYER_VERSION);
  });

  it('formats version matrix with dotted alignment', () => {
    const text = formatArchitectureVersionMatrix(
      buildArchitectureVersionMatrix('2026-07-12T15:00:00.000Z'),
    );
    expect(text).toContain('TradeScore Version');
    expect(text).toContain('1.0.5');
    expect(text).toContain('UI Layer');
    expect(text).toContain('UL-03.2');
  });

  it('formats feature flags as ON/OFF', () => {
    const flags = resolveRuntimeFeatureFlags({
      esmBridge: DEFAULT_ESM_BRIDGE_STATE,
      journalEntryCount: 0,
    });
    const text = formatFeatureFlagSummary(flags);
    expect(text).toContain('ENTRY_STATE_MANAGER_ENABLED');
    expect(text).toContain('OFF');
    expect(text).toContain('RULEBOOK_ENABLED');
    expect(text).toContain('ON');
  });
});
