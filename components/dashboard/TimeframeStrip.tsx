import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  COLORS,
  TIMEFRAMES,
  type AppTradeSymbol,
  type Timeframe,
} from '../../constants/scoring';
import { PANEL, RADIUS, SPACING } from '../../constants/theme';
import { formatStructureVi, formatTrendVi, vi } from '../../constants/vi';
import type { MtfTimeframeState } from '../../hooks/useMarketAnalysis';
import { formatPrice } from '../../utils/formatPrice';

interface TimeframeStripProps {
  states: MtfTimeframeState[];
  symbol: AppTradeSymbol;
  analysisTimeframe?: Timeframe;
  loading?: boolean;
}

const trendColor = {
  BULLISH: COLORS.bullish,
  BEARISH: COLORS.bearish,
  SIDEWAYS: COLORS.textSecondary,
} as const;

function dominantTrend(states: MtfTimeframeState[]) {
  let bull = 0;
  let bear = 0;
  for (const { loaded, trend } of states) {
    if (!loaded) continue;
    if (trend === 'BULLISH') bull += 1;
    else if (trend === 'BEARISH') bear += 1;
  }
  if (bull > bear) return 'BULLISH' as const;
  if (bear > bull) return 'BEARISH' as const;
  return 'SIDEWAYS' as const;
}

export function TimeframeStrip({
  states,
  symbol,
  analysisTimeframe = '1h',
  loading = false,
}: TimeframeStripProps) {
  const [selectedTf, setSelectedTf] = useState<Timeframe | null>(null);
  const byTf = new Map(states.map((s) => [s.timeframe, s]));
  const loaded = states.filter((s) => s.loaded).length;
  const bull = states.filter((s) => s.loaded && s.trend === 'BULLISH').length;
  const bear = states.filter((s) => s.loaded && s.trend === 'BEARISH').length;
  const majority = dominantTrend(states);
  const selected =
    selectedTf != null
      ? (byTf.get(selectedTf) ?? { timeframe: selectedTf, loaded: false, trend: 'SIDEWAYS' as const, lastSignalType: null, swingHighs: 0, swingLows: 0 })
      : null;

  const toggleTf = (tf: Timeframe) => {
    setSelectedTf((prev) => (prev === tf ? null : tf));
  };

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>{vi.timeframe.title}</Text>
      <View style={styles.strip}>
        {TIMEFRAMES.map((tf, i) => {
          const state = byTf.get(tf) ?? {
            timeframe: tf,
            loaded: false,
            trend: 'SIDEWAYS' as const,
            lastSignalType: null,
            swingHighs: 0,
            swingLows: 0,
          };
          const next = byTf.get(TIMEFRAMES[i + 1]);
          const connectorActive = state.loaded && (next?.loaded ?? false);
          const isAnalysis = tf === analysisTimeframe;
          const isSelected = selectedTf === tf;

          return (
            <View key={tf} style={styles.item}>
              <Pressable
                onPress={() => toggleTf(tf)}
                style={({ pressed }) => [
                  styles.node,
                  state.loaded && styles.nodeLoaded,
                  state.loaded && state.trend === 'BULLISH' && styles.nodeBull,
                  state.loaded && state.trend === 'BEARISH' && styles.nodeBear,
                  isAnalysis && styles.nodeAnalysis,
                  isSelected && styles.nodeSelected,
                  pressed && styles.nodePressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${tf} ${state.loaded ? formatTrendVi(state.trend) : vi.timeframe.detail.noData}`}
              >
                <Text
                  style={[
                    styles.tf,
                    state.loaded && styles.tfLoaded,
                    state.loaded && state.trend === 'BULLISH' && styles.tfBull,
                    state.loaded && state.trend === 'BEARISH' && styles.tfBear,
                    isSelected && styles.tfSelected,
                  ]}
                >
                  {tf}
                </Text>
                {isAnalysis ? <Text style={styles.analysisDot}>●</Text> : null}
              </Pressable>
              {i < TIMEFRAMES.length - 1 ? (
                <View style={[styles.connector, connectorActive && styles.connectorActive]} />
              ) : null}
            </View>
          );
        })}
      </View>

      {selected ? (
        <View style={styles.detailCard}>
          <View style={styles.detailHeader}>
            <Text style={styles.detailTitle}>{selected.timeframe}</Text>
            {selected.timeframe === analysisTimeframe ? (
              <View style={styles.analysisBadge}>
                <Text style={styles.analysisBadgeText}>{vi.timeframe.detail.analysisTf}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.detailRole}>{vi.timeframe.roles[selected.timeframe]}</Text>

          {!selected.loaded ? (
            <Text style={styles.detailMuted}>{vi.timeframe.detail.noData}</Text>
          ) : (
            <>
              <DetailRow
                label={vi.timeframe.detail.trend}
                value={formatTrendVi(selected.trend)}
                valueColor={trendColor[selected.trend]}
              />
              <DetailRow
                label={vi.timeframe.detail.close}
                value={formatPrice(symbol, selected.closePrice ?? 0)}
              />
              <DetailRow
                label={vi.timeframe.detail.structure}
                value={
                  selected.lastSignalType
                    ? formatStructureVi(selected.lastSignalType)
                    : vi.timeframe.detail.noSignal
                }
              />
              <DetailRow
                label={vi.timeframe.detail.swings}
                value={vi.smc.swingsVal(selected.swingHighs, selected.swingLows)}
              />
              {majority !== 'SIDEWAYS' && selected.trend !== 'SIDEWAYS' ? (
                <Text
                  style={[
                    styles.confluenceNote,
                    { color: selected.trend === majority ? COLORS.bullish : COLORS.warning },
                  ]}
                >
                  {selected.trend === majority
                    ? vi.timeframe.detail.aligned
                    : vi.timeframe.detail.notAligned}
                </Text>
              ) : null}
            </>
          )}
        </View>
      ) : null}

      <Text style={styles.hint}>
        {loading && loaded === 0
          ? vi.analysis.loading
          : vi.timeframe.summary(loaded, TIMEFRAMES.length, bull, bear)}
      </Text>
      <Text style={styles.tapHint}>
        {selected ? vi.timeframe.closeHint : vi.timeframe.tapHint}
      </Text>
    </View>
  );
}

function DetailRow({
  label,
  value,
  valueColor = COLORS.textPrimary,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    ...PANEL,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 14,
  },
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  node: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    minWidth: 48,
    alignItems: 'center',
    opacity: 0.45,
  },
  nodeLoaded: {
    opacity: 1,
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(240, 185, 11, 0.06)',
  },
  nodeBull: {
    borderColor: COLORS.bullish,
    backgroundColor: 'rgba(14, 203, 129, 0.08)',
  },
  nodeBear: {
    borderColor: COLORS.bearish,
    backgroundColor: 'rgba(246, 70, 93, 0.08)',
  },
  nodeAnalysis: {
    borderWidth: 2,
  },
  nodeSelected: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(240, 185, 11, 0.14)',
    transform: [{ scale: 1.04 }],
  },
  nodePressed: {
    opacity: 0.85,
  },
  tf: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
    fontVariant: ['tabular-nums'],
  },
  tfLoaded: {
    color: COLORS.accent,
  },
  tfBull: {
    color: COLORS.bullish,
  },
  tfBear: {
    color: COLORS.bearish,
  },
  tfSelected: {
    fontWeight: '800',
  },
  analysisDot: {
    position: 'absolute',
    top: 2,
    right: 4,
    fontSize: 6,
    color: COLORS.accent,
  },
  connector: {
    width: 20,
    height: 2,
    backgroundColor: COLORS.border,
    marginHorizontal: 2,
    opacity: 0.4,
  },
  connectorActive: {
    backgroundColor: COLORS.accent,
    opacity: 1,
  },
  detailCard: {
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    gap: 6,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    flexWrap: 'wrap',
  },
  detailTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  analysisBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(240, 185, 11, 0.08)',
  },
  analysisBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.accent,
  },
  detailRole: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  detailLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    flex: 1,
  },
  detailValue: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
    flexShrink: 1,
  },
  detailMuted: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  confluenceNote: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
  },
  hint: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 12,
  },
  tapHint: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 4,
    fontStyle: 'italic',
  },
});
