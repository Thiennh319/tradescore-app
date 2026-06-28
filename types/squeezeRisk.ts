export type SqueezeDirection = 'LONG_SQUEEZE' | 'SHORT_SQUEEZE' | 'NONE';

export type SqueezeLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';

export interface SqueezeRiskInput {
  /** Funding — đơn vị % */
  fundingCurrent: number;
  /** Funding velocity — đơn vị % */
  fundingVelocity: number;
  /** Funding acceleration — đơn vị % */
  fundingAcceleration: number;

  currentOI: number;
  /** % change 1H */
  oiChange1h: number;
  /** % change 4H */
  oiChange4h: number;

  /** % change 1H */
  priceChange1h: number;
  /** % change 4H */
  priceChange4h: number;

  longShortRatio: number;

  whaleWallDirection: 'BID' | 'ASK' | 'NONE';
  /** % cách giá hiện tại */
  whaleWallDistancePercent: number;
}

export interface SqueezeComponentScore {
  fundingCrowding: number;
  oiExpansion: number;
  lsCrowding: number;
  priceOiDivergence: number;
  whaleWallConfirmation: number;
}

export interface SqueezeRiskResult {
  score: number;
  level: SqueezeLevel;
  direction: SqueezeDirection;
  components: SqueezeComponentScore;
  reasons: string[];
  timestamp: number;
}
