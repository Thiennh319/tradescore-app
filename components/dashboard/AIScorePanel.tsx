import { StyleSheet, Text, View } from 'react-native';
import { COLORS, LAYER_NAMES, type LayerName } from '../../constants/scoring';
import { PANEL, RADIUS, SPACING } from '../../constants/theme';
import { formatLayerVi, formatScoreBiasVi, vi } from '../../constants/vi';
import type { TradeAnalysis } from '../../hooks/useMarketAnalysis';

interface AIScorePanelProps {
  analysis: TradeAnalysis | null;
  loading: boolean;
}

const biasColor = {
  STRONG_LONG: COLORS.bullish,
  LONG: COLORS.bullishMuted,
  NEUTRAL: COLORS.neutral,
  SHORT: COLORS.bearishMuted,
  STRONG_SHORT: COLORS.bearish,
} as const;

export function AIScorePanel({ analysis, loading }: AIScorePanelProps) {
  if (loading && !analysis) {
    return (
      <View style={styles.panel}>
        <Text style={styles.loading}>{vi.ai.loading}</Text>
      </View>
    );
  }
  if (!analysis) return null;

  const { aiScore, entryQuality } = analysis;
  const topLayers = [...LAYER_NAMES]
    .sort(
      (a, b) =>
        (aiScore.weightedContribution[b] ?? 0) - (aiScore.weightedContribution[a] ?? 0),
    )
    .slice(0, 5);

  const scoreColor = biasColor[aiScore.bias];

  return (
    <View style={styles.panel}>
      <View style={styles.accentStrip} />
      <View style={styles.body}>
        <View style={styles.heroRow}>
          <View style={[styles.scoreRing, { borderColor: scoreColor }]}>
            <Text style={styles.scoreLabel}>{vi.ai.title}</Text>
            <Text style={[styles.scoreValue, { color: scoreColor }]}>
              {aiScore.finalScore.toFixed(1)}
            </Text>
            <Text style={[styles.biasTag, { color: scoreColor }]}>
              {formatScoreBiasVi(aiScore.bias)}
            </Text>
          </View>

          <View style={styles.metaCol}>
            <MetaRow label={vi.ai.entryQuality} value={`${entryQuality.score.toFixed(0)}/100`} />
            <MetaRow label={vi.ai.mae} value={`${entryQuality.mae.toFixed(2)}%`} />
            <MetaRow
              label={vi.ai.liqDist}
              value={`${entryQuality.liquidityDistance.toFixed(2)}%`}
            />
            <Text style={styles.note}>{aiScore.note}</Text>
            <Text style={styles.entryNote}>{entryQuality.note}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>{vi.ai.topLayers}</Text>
        {topLayers.map((layer) => (
          <LayerRow
            key={layer}
            layer={layer}
            layerScore={aiScore.layerScores[layer]}
            weight={aiScore.weightedContribution[layer]}
          />
        ))}
      </View>
    </View>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function LayerRow({
  layer,
  layerScore,
  weight,
}: {
  layer: LayerName;
  layerScore: number;
  weight: number;
}) {
  const pct = Math.min(100, (weight / 18) * 100);
  return (
    <View style={styles.layerRow}>
      <Text style={styles.layerName} numberOfLines={1}>
        {formatLayerVi(layer)}
      </Text>
      <Text style={styles.layerScore}>{layerScore.toFixed(0)}</Text>
      <View style={styles.layerBarTrack}>
        <View style={[styles.layerBarFill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.layerWeight}>{weight.toFixed(1)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    ...PANEL,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.md,
    padding: 0,
    overflow: 'hidden',
  },
  accentStrip: {
    height: 3,
    backgroundColor: COLORS.accent,
  },
  body: {
    padding: SPACING.lg,
  },
  loading: {
    padding: SPACING.lg,
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  heroRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  scoreRing: {
    minWidth: 140,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
    borderRadius: RADIUS.lg,
    borderWidth: 2,
    backgroundColor: COLORS.background,
  },
  scoreLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  scoreValue: {
    fontSize: 42,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    marginVertical: 4,
    letterSpacing: -1,
  },
  biasTag: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  metaCol: {
    flex: 1,
    minWidth: 200,
    gap: 8,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  metaLabel: {
    flex: 1,
    fontSize: 11,
    color: COLORS.textMuted,
  },
  metaValue: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  note: {
    fontSize: 10,
    color: COLORS.accent,
    marginTop: 6,
  },
  entryNote: {
    fontSize: 10,
    color: COLORS.textSecondary,
    lineHeight: 14,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: SPACING.sm,
  },
  layerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  layerName: {
    flex: 1.2,
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  layerScore: {
    width: 28,
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textPrimary,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  layerBarTrack: {
    flex: 1,
    height: 4,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 2,
    overflow: 'hidden',
  },
  layerBarFill: {
    height: '100%',
    backgroundColor: COLORS.accent,
    borderRadius: 2,
  },
  layerWeight: {
    width: 32,
    fontSize: 10,
    color: COLORS.textMuted,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
});
