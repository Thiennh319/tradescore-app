import type {
  RuleAuditAdxInput,
  RuleAuditAtrInput,
  RuleAuditBollingerInput,
  RuleAuditBollingerTimeframe,
  RuleAuditBtcContextInput,
  RuleAuditCvdInput,
  RuleAuditEmaInput,
  RuleAuditEmaTimeframe,
  RuleAuditFundingInput,
  RuleAuditLongShortRatioInput,
  RuleAuditMacdInput,
  RuleAuditMacdTimeframe,
  RuleAuditOiInput,
  RuleAuditRsiInput,
  RuleAuditSnapshot,
  RuleAuditStructureInput,
  RuleAuditVolumeInput,
  RuleAuditVwapInput,
} from '../types/ruleAuditSnapshot';

function emptyEmaTimeframe(): RuleAuditEmaTimeframe {
  return {
    ema20: 0,
    ema50: 0,
    ema200: null,
    slope20: 'FLAT',
    slope50: 'FLAT',
    priceVsEma20Pct: 0,
    priceVsEma50Pct: 0,
    priceAboveEma20: false,
    priceAboveEma50: false,
  };
}

function emptyEma(): RuleAuditEmaInput {
  return {
    h1: emptyEmaTimeframe(),
    h4: emptyEmaTimeframe(),
    alignment: '',
    pullback: false,
  };
}

function emptyRsi(): RuleAuditRsiInput {
  return {
    rsi1h: 0,
    rsi4h: 0,
    divergence1h: 'NONE',
    divergence4h: 'NONE',
  };
}

function emptyMacdTimeframe(): RuleAuditMacdTimeframe {
  return {
    macd: 0,
    signal: 0,
    histogram: 0,
    isTurningUp: false,
    isTurningDown: false,
    crossedZeroRecentlyUp: false,
    crossedZeroRecentlyDown: false,
  };
}

function emptyMacd(): RuleAuditMacdInput {
  return {
    h1: emptyMacdTimeframe(),
    h4: emptyMacdTimeframe(),
  };
}

function emptyBollingerTimeframe(): RuleAuditBollingerTimeframe {
  return {
    percentB: 0,
    bandwidth: 0,
    bandwidthSlope: 'FLAT',
    marketMode: 'RANGING',
    upper: 0,
    middle: 0,
    lower: 0,
  };
}

function emptyBollinger(): RuleAuditBollingerInput {
  return {
    h1: emptyBollingerTimeframe(),
    h4: emptyBollingerTimeframe(),
  };
}

function emptyVolume(): RuleAuditVolumeInput {
  return {
    volumeRatio1h: 0,
    volumeRatio4h: 0,
    lastVolume: 0,
    avgVolume1h: 0,
  };
}

function emptyCvd(): RuleAuditCvdInput {
  return {
    value: 0,
    trend: 'FLAT',
    slope: 'flat',
    divergence: false,
    divergenceType: 'NONE',
    supportive: false,
    cvdMomentum24h: 0,
    reason: '',
  };
}

function emptyOi(): RuleAuditOiInput {
  return {
    current: 0,
    previous: 0,
    delta: 0,
    change1hPct: 0,
    change4hPct: 0,
  };
}

function emptyFunding(): RuleAuditFundingInput {
  return {
    ratePct: 0,
    avg8: 0,
    avg16: 0,
    velocity: 0,
    acceleration: 0,
    state: '',
  };
}

function emptyLongShortRatio(): RuleAuditLongShortRatioInput {
  return {
    topRatio: 0,
    globalRatio: 0,
    topHistory: [],
  };
}

function emptyBtcContext(): RuleAuditBtcContextInput {
  return {
    change24hPct: 0,
    change1hPct: 0,
    trend: '',
    regimeConfidence: 0,
  };
}

function emptyAdx(): RuleAuditAdxInput {
  return {
    adx1h: 0,
    adx4h: 0,
    adxAvg: 0,
    regime: 'CHOPPY',
    regimeStrength: 'WEAK',
    isChoppy1h: false,
    isChoppy4h: false,
    bothChoppy: false,
    gateAllowed: false,
    gateBlock: false,
    gateSeverity: 'OK',
    gateTpMultiplier: 0,
    gateSlMultiplier: 0,
    gateMessage: '',
  };
}

function emptyVwap(): RuleAuditVwapInput {
  return {
    vwap: 0,
    upperBand1: 0,
    lowerBand1: 0,
    upperBand2: 0,
    lowerBand2: 0,
    priceVsVwap: 0,
    zone: 'NEAR_VWAP',
    isNearVwap: false,
    isPullingBackToVwap: false,
    sessionStart: 0,
    candleCount: 0,
    entryQuality: 'NEUTRAL',
    suggestedEntry: null,
    entryReason: '',
  };
}

function emptyAtr(): RuleAuditAtrInput {
  return {
    atr1h: 0,
    atr1hPct: 0,
  };
}

function emptyStructure(): RuleAuditStructureInput {
  return {
    swingPrice: 0,
    swingTime: 0,
    slPrice: 0,
    slSource: 'STRUCTURE',
    bufferPct: 0,
    distanceFromEntry: 0,
    candlesBack: 0,
    lookbackCandles: 0,
  };
}

export function buildRuleAuditSnapshot(): RuleAuditSnapshot {
  return {
    ema: emptyEma(),
    rsi: emptyRsi(),
    macd: emptyMacd(),
    bollinger: emptyBollinger(),
    volume: emptyVolume(),
    cvd: emptyCvd(),
    oi: emptyOi(),
    funding: emptyFunding(),
    longShortRatio: emptyLongShortRatio(),
    btcContext: emptyBtcContext(),
    adx: emptyAdx(),
    vwap: emptyVwap(),
    atr: emptyAtr(),
    structure: emptyStructure(),
  };
}
