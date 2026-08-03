/**
 * Task 14.1 — Full Journal Intelligence sections (1–10) in detail modal.
 */
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { AiTradeJournalEntry } from '../../constants/aiJournal';
import { COLORS } from '../../constants/scoring';
import { SPACING } from '../../constants/theme';
import { buildJournalEntryIntelligence } from '../../services/intelligence';
import { JournalEvidencePanel } from './JournalEvidencePanel';
import { JournalReplayTimeline } from './JournalReplayTimeline';
import { vi } from '../../constants/vi';

const UL = vi.ulAnalytics;

export function JournalEntryIntelligenceSection({
  entry,
}: {
  entry: AiTradeJournalEntry;
}) {
  const intel = useMemo(() => buildJournalEntryIntelligence(entry), [entry]);
  const s = intel.tradeSummary;
  const d = intel.decisionSnapshot;
  const m = intel.marketSnapshot;

  return (
    <View style={styles.wrap}>
      <Text style={styles.section}>{UL.insight.tradingIntelligence}</Text>

      <Text style={styles.sub}>{UL.journal.tradeSummary}</Text>
      <Row label={UL.journal.coin} value={s.coin} />
      <Row label={UL.journal.strategy} value={s.strategy ?? '—'} />
      <Row label={UL.journal.direction} value={s.direction} />
      <Row label={UL.journal.pnl} value={s.pnlUsdt == null ? '—' : `${s.pnlUsdt.toFixed(2)} U`} />
      <Row label="RR" value={s.rr == null ? '—' : s.rr.toFixed(2)} />
      <Row
        label={UL.journal.holding}
        value={s.holdingTimeMinutes == null ? '—' : `${s.holdingTimeMinutes} m`}
      />
      <Row label={UL.journal.status} value={s.status} />

      <Text style={styles.sub}>{UL.journal.decisionSnapshot}</Text>
      <Row label={UL.journal.decision} value={d.decision} />
      <Row label={UL.journal.confidence} value={d.confidence == null ? '—' : String(d.confidence)} />
      <Row label={UL.journal.trigger} value={d.trigger ?? '—'} />
      <Row label={UL.journal.entryReason} value={d.entryReason ?? '—'} />
      {d.checklist.map((c) => (
        <Line key={c.label} text={`${c.passed ? '✓' : '✗'} ${c.label}`} />
      ))}

      <Text style={styles.sub}>{UL.journal.marketSnapshot}</Text>
      <Row label={UL.journal.trend} value={m.trend} />
      <Row label="Funding" value={String(m.funding)} />
      <Row label="Whale" value={String(m.whale)} />
      <Row label={UL.journal.btcContext} value={`${m.btcContext}%`} />
      <Row label={UL.journal.volatility} value={String(m.volatility)} />
      <Row label={UL.journal.structure} value={m.marketStructure} />
      <Row label={UL.journal.liquidity} value={m.liquidity} />
      <Row label={UL.journal.session} value={m.session} />

      <Text style={styles.sub}>{UL.journal.advisorTimeline}</Text>
      {intel.adviserTimeline.length === 0 ? (
        <Line text="—" />
      ) : (
        intel.adviserTimeline.map((a) => (
          <Line
            key={a.sequence}
            text={`#${a.sequence} ${a.actionLabel} · ${a.advisorActionCode} · ${a.advisorReasonCode}`}
          />
        ))
      )}

      <Text style={styles.sub}>{UL.journal.eventReplay}</Text>
      <JournalReplayTimeline tradeId={intel.tradeId} events={intel.eventTimeline} />

      <Text style={styles.sub}>{UL.journal.outcomeAnalysis}</Text>
      <Row label={UL.journal.success} value={fmtBool(intel.outcome.success)} />
      <Row label={UL.journal.failure} value={fmtBool(intel.outcome.failure)} />
      <Row
        label={UL.journal.pnl}
        value={
          intel.outcome.pnlUsdt == null ? '—' : `${intel.outcome.pnlUsdt.toFixed(2)} U`
        }
      />
      <Row label="RR" value={intel.outcome.rr == null ? '—' : intel.outcome.rr.toFixed(2)} />
      <Row label={UL.journal.executionQ} value={String(intel.outcome.executionQuality)} />
      <Row label={UL.journal.riskQ} value={String(intel.outcome.riskQuality)} />
      <Row label={UL.journal.discipline} value={String(intel.outcome.disciplineScore)} />
      <Row
        label={UL.journal.advisorAcc}
        value={
          intel.outcome.advisorAccuracy == null
            ? '—'
            : String(intel.outcome.advisorAccuracy)
        }
      />
      <Line text={intel.outcome.summary} />

      <Text style={styles.sub}>{UL.journal.rootCause}</Text>
      <Row label={UL.journal.category} value={intel.rootCause.category} />
      <Line text={intel.rootCause.primary} />
      <Line text={intel.rootCause.detail} />

      <Text style={styles.sub}>{UL.journal.evidence}</Text>
      <JournalEvidencePanel items={intel.evidence} />

      <Text style={styles.sub}>{UL.journal.aiSummary}</Text>
      <Line text={intel.aiSummary.text} />
      <Line text={`${UL.insight.evidence}: ${intel.aiSummary.evidenceIds.join(', ')}`} />
    </View>
  );
}

function fmtBool(v: boolean | null): string {
  if (v == null) return '—';
  return v ? UL.journal.yes : UL.journal.no;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function Line({ text }: { text: string }) {
  return <Text style={styles.line}>{text}</Text>;
}

const styles = StyleSheet.create({
  wrap: { marginTop: SPACING.md, gap: 3 },
  section: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 14,
    marginBottom: 4,
  },
  sub: {
    color: COLORS.textPrimary,
    fontWeight: '600',
    fontSize: 12,
    marginTop: SPACING.sm,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  label: { color: COLORS.textMuted, fontSize: 12, flex: 1 },
  value: {
    color: COLORS.textSecondary,
    fontSize: 12,
    flexShrink: 1,
    textAlign: 'right',
  },
  line: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18 },
});
