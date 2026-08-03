/**
 * V4.1 Rulebook Trace — Markdown formatter.
 * Renders frozen RulebookV41Trace only. Embedded AI REVIEW SPEC at end.
 * Vocabulary: PASS|FAIL|WATCH|SKIPPED|INFO — no V3/V4 HARD/SOFT/UNLOCK.
 */

import { kv, table, UNAVAILABLE } from '../formatters/markdown';
import type { RulebookV41Rule, RulebookV41Trace } from './Types';

const SECTION = '---';
const RULE_DIVIDER = '--------------------------------';

function renderMetadata(doc: RulebookV41Trace): string[] {
  const m = doc.metadata;
  return [
    '## METADATA',
    kv('Document Version', m.version),
    kv('Generated At', m.generatedAt),
    kv('Filename', doc.filename),
    kv('Symbol', doc.symbol || m.coin || UNAVAILABLE),
    kv('Trade Id', m.tradeId || UNAVAILABLE),
    kv('Side', m.side || UNAVAILABLE),
    kv('Engine Version', m.engineVersion),
    kv('Build Info Version', m.buildInfoVersion),
    '',
  ];
}

function renderInputSnapshot(doc: RulebookV41Trace): string[] {
  const s = doc.input;
  return [
    '## INPUT SNAPSHOT',
    kv('Symbol', s.symbol),
    kv('Scan Timestamp (ms)', s.scanTimestamp),
    kv('Fetched At (ms)', s.fetchedAt),
    kv('Row Error', s.rowError ?? UNAVAILABLE),
    kv('Trend Strength', s.trendStrength),
    kv('Trend Direction', s.trendDirection),
    kv('Trend Exhaustion (4H MI)', s.trendExhaustion),
    kv('Volume Divergence Pts', s.volumeDivergencePts),
    kv('Reversal Probability', s.reversalProbability),
    kv('Market Confidence', s.marketConfidence),
    kv('Market State', s.marketState),
    kv('Visibility Mode', s.visibilityMode),
    kv('Early Warning Severity', s.earlyWarningSeverity),
    kv('Momentum Confirmed Long', s.momentumConfirmedLong),
    kv('Momentum Confirmed Short', s.momentumConfirmedShort),
    kv('Funding Rate', s.fundingRate),
    kv('Has Klines 1H', s.hasKlines1H),
    kv('Has Klines 4H', s.hasKlines4H),
    kv('Has BTC Klines 4H', s.hasBtcKlines4H),
    '',
  ];
}

function renderOneRule(rule: RulebookV41Rule, index: number): string[] {
  const lines = [
    `### Rule ${String(index + 1).padStart(2, '0')} — ${rule.id}`,
    '',
    kv('Name', rule.name),
    kv('Stage', rule.stage),
    kv('Status', rule.status),
    kv('Actual', rule.actual),
    kv('Threshold', rule.threshold),
    kv('Unit', rule.unit ?? UNAVAILABLE),
    kv('Source Module', rule.sourceModule),
    kv('Gates', rule.gates ?? UNAVAILABLE),
    kv('Data Source', rule.dataSource),
    kv('Data Source Detail', rule.dataSourceDetail),
    kv('Reason (VI)', rule.reasonVi),
    'Evidence:',
  ];
  if (rule.evidence && rule.evidence.length > 0) {
    for (const ev of rule.evidence) {
      lines.push(`- ${ev.label}=${ev.value ?? UNAVAILABLE}`);
    }
  } else {
    lines.push(`- ${UNAVAILABLE}`);
  }
  lines.push(RULE_DIVIDER, '');
  return lines;
}

function renderRuleTrace(doc: RulebookV41Trace): string[] {
  const lines = ['## RULE TRACE', ''];
  if (doc.rules.length === 0) {
    lines.push(kv('Rules', UNAVAILABLE), '');
    return lines;
  }
  doc.rules.forEach((rule, i) => {
    lines.push(...renderOneRule(rule, i));
  });
  return lines;
}

function renderEvaluationTable(doc: RulebookV41Trace): string[] {
  /** Pipe in cell content breaks Markdown table columns — sanitize Threshold only here. */
  const thresholdForTable = (value: RulebookV41Trace['rules'][number]['threshold']) => {
    if (typeof value !== 'string') return value;
    return value.replace(/\|/g, ' / ');
  };

  const lines: string[] = [
    '## RULE EVALUATION TABLE',
    ...table(
      ['Rule ID', 'Name', 'Status', 'Actual', 'Threshold', 'Stage', 'Source Module'],
      doc.rules.map((r) => [
        r.id,
        r.name,
        r.status,
        r.actual,
        thresholdForTable(r.threshold),
        r.stage,
        r.sourceModule,
      ]),
    ),
    '',
  ];

  const continuousNote = readTrendReversalConfidenceEvaluationTableNote(doc.rules);
  if (continuousNote != null && continuousNote !== '') {
    lines.push(SECTION, '', continuousNote, '');
  }

  return lines;
}

/**
 * Builder stores Evidence as `{ label, value }[]`.
 * Continuous Rule 05 sets label `evaluationTableNote` to the footnote text.
 * Legacy path omits the field — return null (no footnote).
 */
function readTrendReversalConfidenceEvaluationTableNote(
  rules: readonly RulebookV41Rule[],
): string | null {
  const rule = rules.find((r) => r.id === 'trend_reversal_confidence');
  if (rule?.evidence == null) return null;

  for (const item of rule.evidence) {
    if (item.label !== 'evaluationTableNote') continue;
    if (item.value == null) return null;
    const raw = String(item.value);
    // If value was ever stored as "evaluationTableNote=…", keep text after first '='.
    const eq = raw.indexOf('=');
    if (eq >= 0 && raw.slice(0, eq).trim() === 'evaluationTableNote') {
      return raw.slice(eq + 1);
    }
    return raw;
  }
  return null;
}

function renderSummary(doc: RulebookV41Trace): string[] {
  const s = doc.summary;
  return [
    '## RULE SUMMARY',
    kv('Total Rules', s.totalRules),
    kv('Passed', s.passed),
    kv('Failed', s.failed),
    kv('Watch', s.watch),
    kv('Skipped', s.skipped),
    kv('Info', s.info),
    kv('Decision Output', s.decisionOutput),
    kv('Visibility Mode', s.visibilityMode),
    kv('Trend Reversal State', s.trendReversalState),
    kv('Market Context Applied', s.marketContextApplied),
    kv(
      'Decision Block Codes (V4.1)',
      s.decisionBlockCodes.length > 0 ? s.decisionBlockCodes.join('|') : '(none)',
    ),
    '',
  ];
}

function renderPipelineStageMap(): string[] {
  return [
    '## PIPELINE STAGE MAP',
    '',
    '1. Market Intelligence (snapshot on row) → trendStrength / exhaustion / reversal / confidence / marketState',
    '2. Visibility (show/hide conditions from snapshot) → visibilityMode on row',
    '3. Trend Reversal Task-2 (1H) → cvd_flip / volume / exhaustion / structure_break / confidence → ACTIVE|WATCH',
    '4. Market Context (5 dims, only applied when ACTIVE) → may downgrade to WATCH',
    '5. Confidence Engine → final confidence + decisionContext',
    '6. Decision Engine → LONG|SHORT|WATCH|IGNORE',
    '7. Early Warning BLOCK + Momentum confirmed → entry gates (scan path)',
    '',
    'Note: UI checklist "THIẾU GÌ" chỉ hiện 4 mục (cvd/volume/btc/exhaustion) — thiếu structure_break và đủ 5 market-context dims.',
    '',
  ];
}

function renderDecisionChain(doc: RulebookV41Trace): string[] {
  return [
    '## DECISION CHAIN',
    doc.decisionChain.length > 0 ? doc.decisionChain.join(' → ') : UNAVAILABLE,
    '',
  ];
}

function renderAiReviewChecklist(): string[] {
  return [
    '## AI REVIEW',
    '',
    'Checklist trống — reviewer điền (không suy diễn từ V3/V4):',
    '',
    ...table(
      ['Review Item', 'Result', 'Severity', 'Notes'],
      [
        ['Wrong threshold vs code?', '□', '', ''],
        ['Missing Structure Break while ACTIVE?', '□', '', ''],
        ['Market Context skipped mislabeled as PASS?', '□', '', ''],
        ['Decision vs eligibility contradiction?', '□', '', ''],
        ['Used 4H MI exhaustion for 1H TR gate?', '□', '', ''],
        ['OI/Whale skipped but treated as confirmed?', '□', '', ''],
        ['Visibility condition vs hysteresis outcome confused?', '□', '', ''],
        ['Need Optimization?', '□', '', ''],
      ],
    ),
    '',
  ];
}

function renderEmbeddedSpec(): string[] {
  return [
    '## AI REVIEW SPECIFICATION (Rulebook V4.1 — EMBEDDED)',
    '',
    '### REVIEW RULES',
    '1. Mọi Actual/Threshold phải trùng field copy từ document hoặc từ module được nêu trong Source Module — không đoán.',
    '2. Không map rule V4.1 → Group A/B/C hay HB-/GB- của V3/V4.',
    '3. Status chỉ dùng PASS|FAIL|WATCH|SKIPPED|INFO — không HARD/SOFT/UNLOCK.',
    '4. Checklist UI 4 mục không được hiểu là đủ điều kiện ACTIVE; phải kiểm tra thêm structure_break + conf≥TREND_REVERSAL_CONFIDENCE_MIN + market context.',
    '5. Nếu Evidence thiếu mà rule cần threshold số → classification INSUFFICIENT EVIDENCE, không bịa số.',
    '6. Market State category là INFO/regime — reviewer không tự suy ngưỡng ts/ex/vol từ category (đã khóa ở MI Spec).',
    '7. decision_eligibility phải gọi isEligibleForDirection đã export — không mirror logic riêng trong Builder.',
    '8. OI/Whale trong production scan thường skipped (không có data trên row) — skipped ≠ business PASS; vẫn giữ trong Rulebook v1.',
    '9. Visibility chỉ đánh giá CONDITION tại thời điểm scan (previousMode không có trên row).',
    '10. decision_long_short / decision_watch / decision_ignore dùng Method A partition rời theo confidence (độc lập decision label). decision_final_output = INFO mô tả engine state.',
    '11. LET matchedTier từ decision_final_output: LONG|SHORT→long_short; WATCH→watch; IGNORE→ignore. CRITICAL nếu (a) rule matchedTier ≠ PASS HOẶC (b) rule tier khác matchedTier = PASS.',
    '',
    '### REVIEW LEVEL RESOLUTION (DETERMINISTIC)',
    '',
    'Rulebook đọc Status/Actual đã freeze trong document — KHÔNG tự suy lại ngưỡng từ narrative.',
    '',
    'Decision tier consistency (Method A):',
    '- matchedTier = long_short nếu decision_final_output ∈ {LONG, SHORT}',
    '- matchedTier = watch nếu decision_final_output = WATCH',
    '- matchedTier = ignore nếu decision_final_output = IGNORE',
    '- CRITICAL ⇔ (matchedTier rule status ≠ PASS) ∨ (∃ other tier rule with status = PASS)',
    '- Ngược lại (khớp đúng 1 tier) → INFO',
    '',
    ...table(
      ['Observation (from this document)', 'Suggested V41ReviewLevel', 'Notes'],
      [
        [
          'matchedTier rule KHÔNG PASS (a)',
          'CRITICAL',
          'evaluateDecisionTierConsistency',
        ],
        [
          'Rule tier KHÁC matchedTier lại PASS (b)',
          'CRITICAL',
          'evaluateDecisionTierConsistency',
        ],
        [
          'matchedTier PASS và không tier khác PASS',
          'INFO',
          'Threshold bands khớp decision_final_output',
        ],
        [
          'Rule FAIL mà Decision Output = LONG hoặc SHORT',
          'CRITICAL',
          'Mâu thuẫn pipeline',
        ],
        [
          'structure_break FAIL trong khi Trend Reversal State = ACTIVE',
          'CRITICAL',
          'ACTIVE đòi hỏi đủ signal count (≥ TREND_REVERSAL_ACTIVE_MIN_SIGNALS)',
        ],
        [
          'Market Context dim FAIL nhưng Decision vẫn LONG/SHORT',
          'WARN',
          'Kiểm tra hard-block / eligibility',
        ],
        [
          'decision_eligibility Actual ≠ isEligibleForDirection cùng input',
          'CRITICAL',
          'Builder phải gọi hàm đã export, không tự tính',
        ],
        [
          'OI/Whale Status=SKIPPED bị diễn giải như confirmed PASS',
          'WARN',
          'skipped = no data on row, không chặn',
        ],
        [
          'Thiếu klines1H → nhiều rule SKIPPED khi audit action',
          'BLOCK',
          'Không đủ evidence',
        ],
        [
          'Mọi gate khớp Decision Output',
          'INFO',
          'Descriptive only',
        ],
      ],
    ),
    '',
    '### WORKED EXAMPLES',
    '',
    'Example A — TR chưa đủ:',
    '- Input: cvd_flip=FAIL, volume_confirmation=FAIL → trend_reversal_confidence WATCH',
    '- Reviewer: Decision không được LONG/SHORT chỉ vì Confidence UI cao.',
    '',
    'Example B — Context phủ định:',
    '- Input: ≥ TREND_REVERSAL_ACTIVE_MIN_SIGNALS TR signals + conf≥TREND_REVERSAL_CONFIDENCE_MIN nhưng market_context_btc FAIL → state downgrade WATCH',
    '- Reviewer: WARN nếu Decision vẫn LONG/SHORT.',
    '',
    'Example C — EW BLOCK:',
    '- Input: early_warning_block Actual=BLOCK',
    '- Reviewer: entry/opportunity phải bị chặn; Visibility có thể bị demote WATCH.',
    '',
    '### REVIEW CLASSIFICATION',
    'PASS | BUG | INSUFFICIENT EVIDENCE | ENHANCEMENT',
    '',
  ];
}

/** Format frozen Rulebook V4.1 trace → Markdown. */
export function formatRulebookV41Trace(doc: RulebookV41Trace): string {
  return [
    '# 01_RULEBOOK_V41 (V4.1)',
    '',
    ...renderMetadata(doc),
    SECTION,
    '',
    ...renderInputSnapshot(doc),
    SECTION,
    '',
    ...renderRuleTrace(doc),
    SECTION,
    '',
    ...renderEvaluationTable(doc),
    SECTION,
    '',
    ...renderSummary(doc),
    SECTION,
    '',
    ...renderPipelineStageMap(),
    SECTION,
    '',
    ...renderDecisionChain(doc),
    SECTION,
    '',
    ...renderAiReviewChecklist(),
    SECTION,
    '',
    ...renderEmbeddedSpec(),
  ].join('\n');
}
