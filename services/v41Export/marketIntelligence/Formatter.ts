/**
 * V4.1 Market Intelligence Trace — Markdown formatter.
 * Renders frozen MarketIntelligenceTrace only. Spec reviewer embedded at end.
 */

import { kv, table, UNAVAILABLE } from '../formatters/markdown';
import type { MarketIntelligenceDetail, MarketIntelligenceTrace } from './Types';

const SECTION = '---';

function renderMetadata(doc: MarketIntelligenceTrace): string[] {
  const m = doc.metadata;
  return [
    '## METADATA',
    kv('Document Version', m.version),
    kv('Generated At', m.generatedAt),
    kv('Symbol', doc.symbol || m.coin || UNAVAILABLE),
    kv('Trade Id', m.tradeId || UNAVAILABLE),
    kv('Side', m.side || UNAVAILABLE),
    kv('Engine Version', m.engineVersion),
    kv('Build Info Version', m.buildInfoVersion),
    '',
  ];
}

function renderInputSnapshot(doc: MarketIntelligenceTrace): string[] {
  const s = doc.summary;
  return [
    '## INPUT SNAPSHOT',
    kv('Scan Timestamp (ms)', s.scanTimestamp),
    kv('Trend Strength', s.trendStrength),
    kv('Trend Direction', s.trendDirection),
    kv('Trend Exhaustion', s.trendExhaustion),
    kv('Volume Divergence Pts', s.volumeDivergencePts),
    kv('Reversal Probability', s.reversalProbability),
    kv('RSI Divergence Score', s.rsiDivergenceScore),
    kv('CVD Divergence Score', s.cvdDivergenceScore),
    kv('Market Confidence', s.marketConfidence),
    kv('BTC Alignment Factor', s.btcAlignmentFactor),
    kv('BTC Direction', s.btcDirection),
    kv('Market State', s.marketState),
    '',
  ];
}

function renderDetail(detail: MarketIntelligenceDetail | null): string[] {
  if (!detail) {
    return [
      '## MARKET INTELLIGENCE DETAIL',
      kv('Detail Breakdown', UNAVAILABLE),
      '',
    ];
  }

  const t = detail.trend;
  const e = detail.exhaustion;
  const r = detail.reversal;
  const c = detail.confidence;

  return [
    '## MARKET INTELLIGENCE DETAIL',
    '',
    '### Engine 1 — Trend Strength',
    ...table(
      ['Field', 'Value'],
      [
        ['EMA Alignment Score', t.emaAlignmentScore],
        ['ADX Score', t.adxScore],
        ['Slope Score', t.slopeScore],
        ['Trend Strength', t.trendStrength],
        ['Trend Direction', t.trendDirection],
      ],
    ),
    '',
    '### Engine 2 — Trend Exhaustion',
    ...table(
      ['Field', 'Value'],
      [
        ['RSI Extreme Score', e.rsiExtremeScore],
        ['Distance EMA20 Score', e.distanceEMA20Score],
        ['Volume Divergence Pts', e.volumeDivergencePts],
        ['Candle Streak Score', e.candleStreakScore],
        ['Trend Exhaustion', e.trendExhaustion],
      ],
    ),
    '',
    '### Engine 3 — Reversal Probability',
    ...table(
      ['Field', 'Value'],
      [
        ['Reversal Probability', r.reversalProbability],
        ['RSI Divergence Score', r.rsiDivergenceScore],
        ['CVD Divergence Score', r.cvdDivergenceScore],
      ],
    ),
    '',
    '### Engine 4 — Market Confidence',
    ...table(
      ['Field', 'Value'],
      [
        ['Trend Strength Base', c.trendStrengthBase],
        ['Exhaustion Multiplier', c.exhaustionMultiplier],
        ['BTC Alignment Factor', c.btcAlignmentFactor],
        ['Alt Direction', c.altDirection],
        ['BTC Direction', c.btcDirection],
        ['Market Confidence', c.marketConfidence],
      ],
    ),
    '',
  ];
}

function renderMarketStateSection(doc: MarketIntelligenceTrace): string[] {
  const s = doc.summary;
  return [
    '## MARKET STATE',
    kv('Market State', s.marketState),
    kv('Trend Direction (context)', s.trendDirection),
    kv('Trend Strength (context)', s.trendStrength),
    kv('Trend Exhaustion (context)', s.trendExhaustion),
    kv('Volume Divergence Pts (context)', s.volumeDivergencePts),
    '',
  ];
}

/**
 * Embedded AI reviewer specification — V4.1 vocabulary only.
 * Not copied from V3/V4 Hard/Group/Score block docs.
 */
function renderEmbeddedSpecReviewer(): string[] {
  return [
    '## AI REVIEW SPECIFICATION (V4.1 — EMBEDDED)',
    '',
    '### REVIEW RULES',
    '1. Treat every numeric field as a frozen copy from Market Intelligence Layer — do not recompute Trend Strength, Exhaustion, Reversal, or Confidence.',
    '2. Market State is one of eight categories (StrongUptrend, HealthyUptrend, LateUptrend, Distribution, Accumulation, WeakDowntrend, StrongDowntrend, Transition). Do not map these to V3/V4 Group A/B/C.',
    '3. Use V41ReviewLevel vocabulary only: INFO | WATCH | WARN | BLOCK | CRITICAL. Do not invent HARD/SOFT/UNLOCK block types from Score Version V4.',
    '4. Direction tokens are BULL | BEAR | NEUTRAL (engines) — not LONG/SHORT entry decisions (those belong to later Visibility/Decision exports).',
    '5. If Detail Breakdown is UNAVAILABLE, review only INPUT SNAPSHOT + MARKET STATE; do not invent Engine 1–4 sub-scores.',
    '6. Volume Divergence Pts is only 0 or 20 (copy-only).',
    '7. RSI/CVD Divergence Scores are only 0, 50, or 100 (copy-only).',
    '',
    '### REVIEW LEVEL RESOLUTION (DETERMINISTIC — DO NOT INFER FROM V3/V4)',
    '',
    'Market State đã được tính sẵn bởi marketStateEngine — bảng dưới đây CHỈ ánh xạ category có sẵn sang mức độ review, KHÔNG tự suy ra ngưỡng ts/ex/vol. Nếu cần xem điều kiện chính xác dẫn tới category này, tham khảo code, không suy đoán từ document này.',
    '',
    ...table(
      ['Observation (from this document)', 'Suggested V41ReviewLevel', 'Notes'],
      [
        [
          'Market State = StrongUptrend or StrongDowntrend',
          'INFO',
          'Xu hướng mạnh, rõ ràng (copy category; không suy ra ts/ex)',
        ],
        [
          'Market State = HealthyUptrend or WeakDowntrend',
          'INFO',
          'Xu hướng còn đọc được, mức rủi ro thấp hơn Late/Distribution',
        ],
        [
          'Market State = LateUptrend',
          'WARN',
          'Xu hướng muộn, rủi ro đảo chiều (category copy-only)',
        ],
        [
          'Market State = Distribution or Accumulation',
          'WARN',
          'Vùng phân phối/tích lũy — rủi ro đảo chiều cao hơn LateUptrend',
        ],
        [
          'Market State = Transition OR Trend Direction = NEUTRAL',
          'WATCH',
          'Không có tín hiệu xu hướng rõ',
        ],
        [
          'Detail missing (UNAVAILABLE) while trading action is discussed',
          'BLOCK',
          'Export-integrity (độc lập với marketStateEngine) — thiếu breakdown cho action claims',
        ],
        [
          'Internal contradiction: summary vs detail same-named field differs',
          'CRITICAL',
          'Export-integrity (độc lập với marketStateEngine) — reject narrative',
        ],
      ],
    ),
    '',
    '### WORKED EXAMPLES',
    '',
    'Example A — Distribution caution (khớp Rule 3: BULL + ts≥80 + ex≥70 + vol=20)',
    '- Input: Trend Direction BULL, Trend Strength 82, Trend Exhaustion 75, Volume Divergence Pts 20, Market State Distribution',
    '- Reviewer: V41ReviewLevel WARN — Market State = Distribution (copy-only). Không suy luận lại ts/ex/vol; không coi đây là StrongUptrend/HealthyUptrend entry thesis từ file này.',
    '',
    'Example B — Neutral / transition (khớp Rule 1: ts<25 → Transition)',
    '- Input: Trend Direction NEUTRAL, Trend Strength 18, Market State Transition',
    '- Reviewer: V41ReviewLevel WATCH — no directional MI; LONG/SHORT claims are out of scope for this document.',
    '',
    'Example C — Detail absent (export-integrity — áp dụng độc lập với Market State, không phải rule của marketStateEngine)',
    '- Input: summary filled, Detail Breakdown UNAVAILABLE',
    '- Reviewer: may summarize top-level MI; must not fabricate EMA/ADX/slope or divergence sub-scores. If an action narrative requires sub-scores → BLOCK.',
    '',
  ];
}

/** Format frozen MI trace → Markdown (01_MARKET_INTELLIGENCE.md body). */
export function formatMarketIntelligenceTrace(doc: MarketIntelligenceTrace): string {
  return [
    '# 01_MARKET_INTELLIGENCE (V4.1)',
    '',
    ...renderMetadata(doc),
    SECTION,
    '',
    ...renderInputSnapshot(doc),
    SECTION,
    '',
    ...renderDetail(doc.detail),
    SECTION,
    '',
    ...renderMarketStateSection(doc),
    SECTION,
    '',
    ...renderEmbeddedSpecReviewer(),
  ].join('\n');
}
