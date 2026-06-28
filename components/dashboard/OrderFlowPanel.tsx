import { StyleSheet, Text, View } from 'react-native';
import { COLORS, type FundingOIRegime } from '../../constants/scoring';
import { PANEL, RADIUS, SPACING } from '../../constants/theme';
import { formatDivergenceVi, formatFundingOiVi, vi } from '../../constants/vi';
import type { OrderFlowAnalysis } from '../../services/indicators';
import { CVDChart } from './CVDChart';

interface OrderFlowPanelProps {
  flow: OrderFlowAnalysis;
}

const regimeColor: Record<FundingOIRegime, string> = {
  LONG_SQUEEZE_RISK: COLORS.bearish,
  SHORT_SQUEEZE_RISK: COLORS.bullish,
  ACCUMULATION: COLORS.bullishMuted,
  DISTRIBUTION: COLORS.bearishMuted,
  NEUTRAL: COLORS.textSecondary,
};

export function OrderFlowPanel({ flow }: OrderFlowPanelProps) {
  const div = flow.divergences.find((d) => d.type !== 'NONE') ?? flow.divergences[0];
  const { DeltaOI, fundingVelocity, regime } = flow.fundingOI;
  const cvdLast = flow.cvd[flow.cvd.length - 1];

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>{vi.orderFlow.title}</Text>
      <Text style={styles.caption}>{vi.orderFlow.caption}</Text>

      <CVDChart cvd={flow.cvd} height={90} />

      <View style={styles.metrics}>
        <Metric label={vi.orderFlow.cvd} value={Number.isFinite(cvdLast) ? cvdLast.toFixed(1) : '—'} />
        <Metric label={vi.orderFlow.deltaOi} value={DeltaOI.toFixed(0)} />
        <Metric
          label={vi.orderFlow.fundVel}
          value={vi.orderFlow.fundVelVal((fundingVelocity * 10000).toFixed(3))}
        />
      </View>

      <View style={styles.divBox}>
        <Text style={styles.divLabel}>{vi.orderFlow.divergence}</Text>
        <Text
          style={[
            styles.divType,
            {
              color:
                div.type === 'BULLISH'
                  ? COLORS.bullish
                  : div.type === 'BEARISH'
                    ? COLORS.bearish
                    : COLORS.textMuted,
            },
          ]}
        >
          {formatDivergenceVi(div.type)}
        </Text>
        {vi.orderFlow.divNote[div.type] ? (
          <Text style={styles.divNote}>{vi.orderFlow.divNote[div.type]}</Text>
        ) : null}
      </View>

      <View style={[styles.regimePill, { borderColor: regimeColor[regime] }]}>
        <Text style={[styles.regimeText, { color: regimeColor[regime] }]}>
          {formatFundingOiVi(regime)}
        </Text>
      </View>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    ...PANEL,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    flex: 1,
    minWidth: 260,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  caption: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
    marginBottom: 12,
  },
  metrics: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    marginBottom: 12,
  },
  metric: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: 4,
    padding: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  metricLabel: {
    fontSize: 9,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  divBox: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  divLabel: {
    fontSize: 9,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  divType: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  divNote: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  regimePill: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
  },
  regimeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
});
