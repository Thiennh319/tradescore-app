import type { SqueezeComponentScore, SqueezeLevel } from '../types/squeezeRisk';

export const SQUEEZE_LEVEL_COLORS: Record<SqueezeLevel, string> = {
  LOW: '#10B981',
  MEDIUM: '#F59E0B',
  HIGH: '#F97316',
  EXTREME: '#EF4444',
};

export const SQUEEZE_LEVEL_LABELS: Record<SqueezeLevel, string> = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  EXTREME: 'EXTREME',
};

export const SQUEEZE_COMPONENT_LABELS: Record<keyof SqueezeComponentScore, string> = {
  fundingCrowding: 'Funding crowding',
  oiExpansion: 'OI expansion',
  lsCrowding: 'L/S crowding',
  priceOiDivergence: 'Price/OI divergence',
  whaleWallConfirmation: 'Whale wall',
};

export const SQUEEZE_COMPONENT_KEYS = Object.keys(
  SQUEEZE_COMPONENT_LABELS,
) as (keyof SqueezeComponentScore)[];
