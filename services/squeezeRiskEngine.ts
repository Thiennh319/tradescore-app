import type {
  SqueezeComponentScore,
  SqueezeDirection,
  SqueezeLevel,
  SqueezeRiskInput,
  SqueezeRiskResult,
} from '../types/squeezeRisk';

type SqueezeSide = 'LONG' | 'SHORT';

function calculateFundingCrowding(input: SqueezeRiskInput, direction: SqueezeSide): number {
  const { fundingCurrent, fundingVelocity } = input;

  if (direction === 'LONG') {
    if (fundingCurrent > 0.01 && fundingVelocity > 0) return 2;
    if (fundingCurrent > 0.005 && fundingVelocity > 0) return 1.5;
    if (fundingCurrent > 0.005 && fundingVelocity <= 0) return 1;
    return 0;
  }

  if (fundingCurrent < -0.01 && fundingVelocity < 0) return 2;
  if (fundingCurrent < -0.005 && fundingVelocity < 0) return 1.5;
  if (fundingCurrent < -0.005 && fundingVelocity >= 0) return 1;
  return 0;
}

function calculateOIExpansion(input: SqueezeRiskInput, _direction: SqueezeSide): number {
  const { oiChange1h, oiChange4h } = input;

  if (oiChange1h > 5 && oiChange4h > 10) return 2;
  if (oiChange1h > 3 && oiChange4h > 5) return 1.5;
  if (oiChange1h > 1) return 1;
  if (oiChange1h <= 0) return 0;
  return 0;
}

function calculateLSCrowding(input: SqueezeRiskInput, direction: SqueezeSide): number {
  const { longShortRatio } = input;

  if (direction === 'LONG') {
    if (longShortRatio > 2.2) return 2;
    if (longShortRatio > 1.8) return 1.5;
    if (longShortRatio > 1.5) return 1;
    return 0;
  }

  if (longShortRatio < 0.55) return 2;
  if (longShortRatio < 0.7) return 1.5;
  if (longShortRatio < 0.85) return 1;
  return 0;
}

function calculatePriceOIDivergence(input: SqueezeRiskInput, direction: SqueezeSide): number {
  const { oiChange1h, priceChange1h } = input;

  if (priceChange1h === 0) return 0;

  const ratio = Math.abs(oiChange1h) / Math.abs(priceChange1h);

  if (direction === 'LONG') {
    if (oiChange1h <= 0 || priceChange1h <= 0) return 0;
    if (ratio > 4) return 2;
    if (ratio > 2.5) return 1.5;
    if (ratio > 1.5) return 1;
    return 0;
  }

  if (oiChange1h <= 0 || priceChange1h >= 0) return 0;
  if (ratio > 4) return 2;
  if (ratio > 2.5) return 1.5;
  if (ratio > 1.5) return 1;
  return 0;
}

function calculateWhaleWall(input: SqueezeRiskInput, direction: SqueezeSide): number {
  const { whaleWallDirection, whaleWallDistancePercent } = input;

  if (direction === 'LONG') {
    if (whaleWallDirection === 'ASK' && whaleWallDistancePercent <= 1) return 2;
    if (whaleWallDirection === 'ASK' && whaleWallDistancePercent <= 3) return 1;
    return 0;
  }

  if (whaleWallDirection === 'BID' && whaleWallDistancePercent <= 1) return 2;
  if (whaleWallDirection === 'BID' && whaleWallDistancePercent <= 3) return 1;
  return 0;
}

function sumComponents(components: SqueezeComponentScore): number {
  return (
    components.fundingCrowding +
    components.oiExpansion +
    components.lsCrowding +
    components.priceOiDivergence +
    components.whaleWallConfirmation
  );
}

function buildComponents(input: SqueezeRiskInput, direction: SqueezeSide): SqueezeComponentScore {
  return {
    fundingCrowding: calculateFundingCrowding(input, direction),
    oiExpansion: calculateOIExpansion(input, direction),
    lsCrowding: calculateLSCrowding(input, direction),
    priceOiDivergence: calculatePriceOIDivergence(input, direction),
    whaleWallConfirmation: calculateWhaleWall(input, direction),
  };
}

function resolveLevel(score: number): SqueezeLevel {
  if (score >= 9) return 'EXTREME';
  if (score >= 6) return 'HIGH';
  if (score >= 3) return 'MEDIUM';
  return 'LOW';
}

function buildReasons(components: SqueezeComponentScore, direction: SqueezeSide): string[] {
  const reasons: string[] = [];

  if (components.fundingCrowding > 1.5) {
    reasons.push(
      direction === 'LONG'
        ? 'Funding dương cao và tăng nhanh — Long đang đông'
        : 'Funding âm sâu và giảm nhanh — Short đang đông',
    );
  } else if (components.fundingCrowding > 0) {
    reasons.push(
      direction === 'LONG'
        ? 'Funding dương — áp lực Long tích lũy'
        : 'Funding âm — áp lực Short tích lũy',
    );
  }

  if (components.oiExpansion === 2) {
    reasons.push('OI tăng mạnh cả 1H và 4H — vị thế đang tích lũy');
  } else if (components.oiExpansion > 0) {
    reasons.push('OI đang mở rộng — vị thế tích lũy');
  }

  if (components.lsCrowding === 2) {
    reasons.push(
      direction === 'LONG'
        ? 'Long/Short ratio >2.2 — quá nhiều Long'
        : 'Long/Short ratio <0.55 — quá nhiều Short',
    );
  } else if (components.lsCrowding > 0) {
    reasons.push(
      direction === 'LONG'
        ? 'Long/Short ratio cao — Long đông'
        : 'Long/Short ratio thấp — Short đông',
    );
  }

  if (components.priceOiDivergence === 2) {
    reasons.push('OI tăng nhanh hơn giá 4× — divergence nguy hiểm');
  } else if (components.priceOiDivergence > 0) {
    reasons.push('OI và giá lệch pha — divergence đáng chú ý');
  }

  if (components.whaleWallConfirmation === 2) {
    reasons.push(
      direction === 'LONG'
        ? 'Whale Ask Wall gần — áp lực bán phía trên mạnh'
        : 'Whale Bid Wall gần — hỗ trợ mua phía dưới mạnh',
    );
  } else if (components.whaleWallConfirmation > 0) {
    reasons.push(
      direction === 'LONG'
        ? 'Whale Ask Wall trong vùng 3% — áp lực bán phía trên'
        : 'Whale Bid Wall trong vùng 3% — hỗ trợ mua phía dưới',
    );
  }

  return reasons;
}

function resolveDirection(
  longScore: number,
  shortScore: number,
  longFunding: number,
  shortFunding: number,
): SqueezeDirection {
  const bothLow = longScore < 3 && shortScore < 3;
  if (bothLow) return 'NONE';

  if (longScore !== shortScore) {
    return longScore > shortScore ? 'LONG_SQUEEZE' : 'SHORT_SQUEEZE';
  }

  // Tie ở mức cao (>=3) — dùng fundingCrowding làm tiêu chí phụ để
  // xác định bên nào thực sự đang "đông" hơn, vì funding rate là tín
  // hiệu trực tiếp nhất về áp lực vị thế tích lũy theo hướng nào.
  if (longFunding !== shortFunding) {
    return longFunding > shortFunding ? 'LONG_SQUEEZE' : 'SHORT_SQUEEZE';
  }

  // Cả tổng điểm và funding đều tie — thực sự không thể phân định
  // hướng, đây là trường hợp hợp lệ để trả NONE.
  return 'NONE';
}

export function calculateSqueezeRisk(input: SqueezeRiskInput): SqueezeRiskResult {
  const longComponents = buildComponents(input, 'LONG');
  const shortComponents = buildComponents(input, 'SHORT');
  const longScore = sumComponents(longComponents);
  const shortScore = sumComponents(shortComponents);
  const direction = resolveDirection(
    longScore,
    shortScore,
    longComponents.fundingCrowding,
    shortComponents.fundingCrowding,
  );
  const score = Math.max(longScore, shortScore);
  const components =
    direction === 'SHORT_SQUEEZE'
      ? shortComponents
      : direction === 'LONG_SQUEEZE'
        ? longComponents
        : longScore >= shortScore
          ? longComponents
          : shortComponents;
  const side: SqueezeSide =
    direction === 'SHORT_SQUEEZE' ? 'SHORT' : direction === 'LONG_SQUEEZE' ? 'LONG' : longScore >= shortScore ? 'LONG' : 'SHORT';

  return {
    score,
    level: resolveLevel(score),
    direction,
    components,
    reasons: direction === 'NONE' ? [] : buildReasons(components, side),
    timestamp: Date.now(),
  };
}
