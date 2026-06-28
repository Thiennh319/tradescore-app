import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../../constants/scoring';
import { PANEL, RADIUS, SPACING } from '../../constants/theme';
import { formatRegimeVi, formatTrendVi, vi } from '../../constants/vi';
import type { TradeAnalysis } from '../../hooks/useMarketAnalysis';
import { LiquidityHeatmapChart } from './LiquidityHeatmapChart';
import { OrderFlowPanel } from './OrderFlowPanel';
import { SMCPanel } from './SMCPanel';

interface AnalysisDashboardProps {
  symbol: string;
  analysis: TradeAnalysis | null;
  loading: boolean;
  timeframe: string;
  midPrice: number | null;
}

export function AnalysisDashboard({
  symbol,
  analysis,
  loading,
  timeframe,
  midPrice,
}: AnalysisDashboardProps) {
  if (loading && !analysis) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator color={COLORS.accent} />
        <Text style={styles.loadingText}>{vi.analysis.loading}</Text>
      </View>
    );
  }

  if (!analysis) return null;

  return (
    <View style={styles.section}>
      <View style={styles.row}>
        <SMCPanel smc={analysis.smc} timeframe={timeframe} symbol={symbol} />
        <OrderFlowPanel flow={analysis.orderFlow} />
      </View>

      <View style={styles.row}>
        <LiquidityHeatmapChart heatmap={analysis.heatmap} midPrice={midPrice} symbol={symbol} />
        <View style={styles.regimeCard}>
          <Text style={styles.regimeTitle}>{vi.analysis.marketRegime}</Text>
          <Text style={styles.regimeValue}>{formatRegimeVi(analysis.regime.regime)}</Text>
          <View style={styles.confidenceBar}>
            <View
              style={[
                styles.confidenceFill,
                { width: `${Math.round(analysis.regime.confidence * 100)}%` },
              ]}
            />
          </View>
          <Text style={styles.confidenceLabel}>
            {vi.analysis.confidenceLabel((analysis.regime.confidence * 100).toFixed(0))}
          </Text>
          <Text style={styles.regimeMeta}>
            {vi.analysis.regimeMeta(
              formatTrendVi(analysis.regime.trend),
              (analysis.regime.bollingerBandwidth * 100).toFixed(2),
            )}
          </Text>
          <Text style={styles.regimeHint}>{vi.analysis.regimeHint}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: SPACING.md,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: SPACING.xl,
    ...PANEL,
    borderRadius: RADIUS.md,
  },
  loadingText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  regimeCard: {
    flex: 1,
    minWidth: 200,
    ...PANEL,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    justifyContent: 'center',
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
  },
  regimeTitle: {
    fontSize: 10,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    fontWeight: '600',
  },
  regimeValue: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 10,
  },
  confidenceBar: {
    height: 4,
    backgroundColor: COLORS.background,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 6,
  },
  confidenceFill: {
    height: '100%',
    backgroundColor: COLORS.accent,
    borderRadius: 2,
  },
  confidenceLabel: {
    fontSize: 10,
    color: COLORS.accent,
    fontWeight: '600',
    marginBottom: 8,
  },
  regimeMeta: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  regimeHint: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 10,
    lineHeight: 15,
  },
});
