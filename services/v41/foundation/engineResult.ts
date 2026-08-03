/**
 * V4.1 Foundation — canonical engine output envelope (v1.1b final).
 */

import type { V41EngineCapabilities } from './capabilities';
import { getEngineCapabilities } from './capabilities';
import type { V41EngineDebug } from './debug';
import type { V41EngineId } from './engineIds';
import type { V41EngineMetrics } from './metrics';
import type { V41ReviewItem } from './reviewItem';
import type { V41StrengthBand } from './strength';
import { normalizeStrength } from './strength';

export const V41_ENGINE_VERSION = '4.1' as const;

export type V41EngineVersion = typeof V41_ENGINE_VERSION;

export interface V41EngineResult<TState extends string = string> {
  /** Canonical engine identifier — use V41_ENGINE_ID constants only. */
  engineId: V41EngineId;
  version: V41EngineVersion;
  /** Domain state token — use foundation state constants where defined. */
  state: TState;
  /** 0–100 numeric confidence (sortable, aggregatable). */
  confidence: number;
  /** 0–100 numeric strength (sortable, aggregatable). */
  strength: number;
  /** Human-readable strength band derived from `strength`. */
  strengthBand: V41StrengthBand;
  /** Structured review rows — canonical for UL Review / tooltip / popup / advisor. */
  reviews: readonly V41ReviewItem[];
  metrics: V41EngineMetrics;
  /** Declarative capability metadata for this engine type. */
  capabilities: V41EngineCapabilities;
  debug?: V41EngineDebug;
}

export interface V41EngineResultValidation {
  valid: boolean;
  errors: string[];
}

export interface BuildV41EngineResultParams<TState extends string> {
  engineId: V41EngineId;
  state: TState;
  confidence: number;
  strength?: number;
  reviews?: readonly V41ReviewItem[];
  metrics: V41EngineMetrics;
  capabilities?: V41EngineCapabilities;
  debug?: V41EngineDebug;
}

function clamp0100(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/** Build a complete envelope with normalized strength + default capabilities. */
export function buildV41EngineResult<TState extends string>(
  params: BuildV41EngineResultParams<TState>,
): V41EngineResult<TState> {
  const confidence = clamp0100(params.confidence);
  const { strength, strengthBand } = normalizeStrength(params.strength ?? confidence);
  return {
    engineId: params.engineId,
    version: V41_ENGINE_VERSION,
    state: params.state,
    confidence,
    strength,
    strengthBand,
    reviews: params.reviews ?? [],
    metrics: params.metrics,
    capabilities: params.capabilities ?? getEngineCapabilities(params.engineId),
    ...(params.debug ? { debug: params.debug } : {}),
  };
}

/** Lightweight structural validation — does not evaluate trading rules. */
export function validateV41EngineResult(result: V41EngineResult): V41EngineResultValidation {
  const errors: string[] = [];
  if (!result.engineId) errors.push('engineId is required');
  if (result.version !== V41_ENGINE_VERSION) errors.push(`version must be ${V41_ENGINE_VERSION}`);
  if (!result.state || typeof result.state !== 'string') errors.push('state is required');
  if (!Number.isFinite(result.confidence)) errors.push('confidence must be finite');
  if (!Number.isFinite(result.strength)) errors.push('strength must be finite');
  if (!result.strengthBand) errors.push('strengthBand is required');
  if (!Array.isArray(result.reviews)) errors.push('reviews must be an array');
  if (!result.metrics || typeof result.metrics !== 'object') errors.push('metrics is required');
  if (!result.capabilities || typeof result.capabilities !== 'object') {
    errors.push('capabilities is required');
  }
  return { valid: errors.length === 0, errors };
}

export function normalizeConfidenceStrength(confidence: number, strength?: number): {
  confidence: number;
  strength: number;
} {
  const c = clamp0100(confidence);
  const s = clamp0100(strength ?? confidence);
  return { confidence: c, strength: s };
}
