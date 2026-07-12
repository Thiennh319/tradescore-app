/**
 * Position Adviser Integration — architecture audit (Task 02.8.4).
 */

import { describe, expect, it } from 'vitest';
import { EntryState, EsmDirection } from './enums';
import { detectHardBlock } from './hardBlockDetectionEngine';
import { buildIntegrationHarnessResult } from './integrationHarness';
import type { IntegrationHarnessContext } from './integrationHarnessTypes';
import {
  DEFAULT_POSITION_ADVISER_ENABLED,
  MODULE_VERSION,
  POSITION_ADVISER_FEATURE_FLAG,
  POSITION_ADVISER_INTEGRATION_FROZEN_VERSION,
} from './metadata';
import { normalizeRuleOutput } from './normalizedRuleOutput';
import {
  PositionAdviserAdapter,
  buildPositionAdviserAdapterResult,
  validatePositionAdviserAdapterContext,
  validatePositionAdviserAdapterResult,
} from './positionAdviserAdapter';
import {
  PositionAdviserIntegrationHarness,
  buildPositionAdviserHarnessFromIntegration,
  buildPositionAdviserHarnessResult,
  validatePositionAdviserHarnessContext,
  validatePositionAdviserHarnessResult,
} from './positionAdviserHarness';
import {
  PositionAdviserWiring,
  FEATURE_FLAG as WIRING_FEATURE_FLAG,
  runPositionAdviserPipeline,
  validatePositionAdviserWiringContext,
  validatePositionAdviserWiringResult,
} from './positionAdviserWiring';
import {
  validateRequiredBoolean,
  validateRequiredNonEmptyString,
} from './pipelineValidationUtils';
import { EntryState as StateMachineEntryState } from './stateMachineTypes';
import type { HardBlockDetectionContext } from './hardBlockDetectionTypes';

const buildHarnessChain = () => {
  const hardBlockResult = detectHardBlock({
    normalizedRuleOutput: normalizeRuleOutput({
      hardBlocks: ['L3 MACD vi phạm — score < 1'],
      groupBlocks: [],
      blockReasons: [],
      adxGateBlocked: false,
      tradePlanValid: true,
      decision: 'VAO_TU_TIN',
    }),
    currentEntryState: EntryState.BLOCKED,
    candidateTransitions: [],
    signalSnapshot: {
      direction: EsmDirection.LONG,
      canEnter: true,
      decision: 'VAO_TU_TIN',
      hardBlocks: [],
      tradePlanValid: true,
      entryScore: 9.0,
    },
    marketSnapshot: {
      symbol: 'BTCUSDT',
      markPrice: 100000,
      timestamp: '2026-07-12T00:00:00Z',
    },
  } as HardBlockDetectionContext);
  const integrationContext: IntegrationHarnessContext = {
    signalBoardScan: {
      symbol: 'BTCUSDT',
      price: 100000,
      direction: 'LONG',
      canEnter: true,
      hardBlocked: false,
    },
    marketSnapshot: {
      symbol: 'BTCUSDT',
      markPrice: 100000,
      timestamp: '2026-07-12T00:00:00Z',
    },
    triggerSnapshot: { hardBlockResult },
    currentState: StateMachineEntryState.WATCH,
    scanId: 'scan-pa-audit-001',
    timestamp: '2026-07-12T00:00:00Z',
  };
  return buildPositionAdviserHarnessFromIntegration(buildIntegrationHarnessResult(integrationContext));
};

describe('Position Adviser Integration audit — Task 02.8.4', () => {
  it('MODULE_VERSION is 2.0.0 — mapping bridge shipped; PA integration frozen at 1.9.0', () => {
    expect(MODULE_VERSION).toBe('2.0.0');
    expect(POSITION_ADVISER_INTEGRATION_FROZEN_VERSION).toBe('1.9.0');
  });

  it('FEATURE_FLAG SSOT — POSITION_ADVISER_ENABLED default off', () => {
    expect(POSITION_ADVISER_FEATURE_FLAG).toBe('POSITION_ADVISER_ENABLED');
    expect(DEFAULT_POSITION_ADVISER_ENABLED).toBe(false);
    expect(WIRING_FEATURE_FLAG).toBe(POSITION_ADVISER_FEATURE_FLAG);
    expect(PositionAdviserWiring.FEATURE_FLAG).toBe(POSITION_ADVISER_FEATURE_FLAG);
    expect(PositionAdviserWiring.DEFAULT_POSITION_ADVISER_ENABLED).toBe(false);
  });

  it('namespace — PositionAdviserAdapter exposes build/validate API', () => {
    expect(PositionAdviserAdapter.buildPositionAdviserAdapterResult).toBe(buildPositionAdviserAdapterResult);
    expect(PositionAdviserAdapter.validatePositionAdviserAdapterContext).toBeTypeOf('function');
    expect(PositionAdviserAdapter.validatePositionAdviserAdapterResult).toBeTypeOf('function');
  });

  it('namespace — PositionAdviserIntegrationHarness exposes build/validate API', () => {
    expect(PositionAdviserIntegrationHarness.buildPositionAdviserHarnessResult).toBeTypeOf('function');
    expect(PositionAdviserIntegrationHarness.buildPositionAdviserHarnessFromIntegration).toBeTypeOf('function');
    expect(PositionAdviserIntegrationHarness.validatePositionAdviserHarnessContext).toBeTypeOf('function');
    expect(PositionAdviserIntegrationHarness.validatePositionAdviserHarnessResult).toBeTypeOf('function');
  });

  it('namespace — PositionAdviserWiring exposes run/validate API', () => {
    expect(PositionAdviserWiring.runPositionAdviserPipeline).toBe(runPositionAdviserPipeline);
    expect(PositionAdviserWiring.validatePositionAdviserWiringContext).toBeTypeOf('function');
    expect(PositionAdviserWiring.validatePositionAdviserWiringResult).toBeTypeOf('function');
    expect(PositionAdviserWiring.isPositionAdviserEnabled).toBeTypeOf('function');
  });

  it('shared validation helpers — validateRequiredNonEmptyString', () => {
    const errors: string[] = [];
    validateRequiredNonEmptyString('', 'scanId', errors);
    expect(errors[0]).toBe('scanId must be a non-empty string');
    validateRequiredNonEmptyString('ok', 'scanId', errors);
    expect(errors).toHaveLength(1);
  });

  it('shared validation helpers — validateRequiredBoolean', () => {
    const errors: string[] = [];
    validateRequiredBoolean('yes', 'positionAdviserEnabled', errors);
    expect(errors[0]).toBe('positionAdviserEnabled must be boolean');
  });

  it('architecture — three-layer stack Adapter → Harness → Wiring', () => {
    const harnessResult = buildHarnessChain();
    const adapterResult = buildPositionAdviserAdapterResult({ harnessResult: harnessResult.adapterResult.context });
    const harness = buildPositionAdviserHarnessResult({
      adapterResult,
      scanId: adapterResult.scanId,
      timestamp: adapterResult.timestamp,
    });
    const wiring = runPositionAdviserPipeline({
      harnessResult: harness,
      positionAdviserEnabled: true,
    });
    expect(wiring).toBe(harness);
    expect(validatePositionAdviserWiringResult(wiring, {
      harnessResult: harness,
      positionAdviserEnabled: true,
    }).valid).toBe(true);
  });

  it('result shape — adapter/harness/wiring share scanId and timestamp', () => {
    const harnessResult = buildHarnessChain();
    expect(harnessResult.scanId).toBe('scan-pa-audit-001');
    expect(harnessResult.positionAdviserInput.timestamp).toBe(harnessResult.timestamp);
    expect(validatePositionAdviserHarnessResult(harnessResult).valid).toBe(true);
  });

  it('delegate validation — adapter context delegates integration harness validation', () => {
    const harnessResult = buildHarnessChain();
    expect(validatePositionAdviserAdapterContext({ harnessResult: harnessResult.adapterResult.context }).valid).toBe(true);
  });

  it('FEATURE_FLAG OFF — wiring returns null without calling adviser', () => {
    const harnessResult = buildHarnessChain();
    const result = runPositionAdviserPipeline({
      harnessResult,
      positionAdviserEnabled: DEFAULT_POSITION_ADVISER_ENABLED,
    });
    expect(result).toBeNull();
  });

  it('deterministic — repeated harness chain yields same triggerId', () => {
    const first = buildHarnessChain();
    const second = buildHarnessChain();
    expect(first.positionAdviserInput.decisionSummary.triggerId).toBe(
      second.positionAdviserInput.decisionSummary.triggerId,
    );
  });

  it('freeze declaration — POSITION_ADVISER_INTEGRATION_FROZEN_VERSION remains 1.9.0', () => {
    expect(POSITION_ADVISER_INTEGRATION_FROZEN_VERSION).toBe('1.9.0');
    expect(MODULE_VERSION).toBe('2.0.0');
  });

  it('regression — full chain validations pass', () => {
    const harnessResult = buildHarnessChain();
    const adapterResult = harnessResult.adapterResult;
    expect(validatePositionAdviserAdapterResult(adapterResult).valid).toBe(true);
    expect(validatePositionAdviserHarnessContext({
      adapterResult,
      scanId: harnessResult.scanId,
      timestamp: harnessResult.timestamp,
    }).valid).toBe(true);
    expect(validatePositionAdviserWiringContext({
      harnessResult,
      positionAdviserEnabled: true,
    }).valid).toBe(true);
  });

  it('public API naming — build*, validate*, run* conventions', () => {
    expect(typeof buildPositionAdviserAdapterResult).toBe('function');
    expect(typeof buildPositionAdviserHarnessResult).toBe('function');
    expect(typeof runPositionAdviserPipeline).toBe('function');
    expect(typeof validatePositionAdviserAdapterResult).toBe('function');
    expect(typeof validatePositionAdviserHarnessResult).toBe('function');
    expect(typeof validatePositionAdviserWiringResult).toBe('function');
  });
});
