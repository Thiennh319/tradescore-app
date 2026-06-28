import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { COLORS } from '../../constants/scoring';
import { PANEL, RADIUS, SPACING } from '../../constants/theme';
import { vi } from '../../constants/vi';
import type { LiquidityHeatmapResult } from '../../services/indicators';
import { formatPrice } from '../../utils/formatPrice';

export interface LiquidityHeatmapChartProps {
  heatmap: LiquidityHeatmapResult;
  midPrice?: number | null;
  symbol?: string;
  height?: number;
}

export function LiquidityHeatmapChart({
  heatmap,
  midPrice,
  symbol = 'BTCUSDT',
  height = 220,
}: LiquidityHeatmapChartProps) {
  const points = heatmap.points;

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>{vi.heatmap.title}</Text>
      <Text style={styles.caption}>{vi.heatmap.captionWeb}</Text>

      {points.length === 0 ? (
        <Text style={styles.empty}>{vi.heatmap.empty}</Text>
      ) : (
        <HeatmapBars points={points} midPrice={midPrice} height={height} symbol={symbol} />
      )}

      <Text style={styles.footer}>
        {vi.heatmap.footer(heatmap.averageVolume.toFixed(2), heatmap.pools.length)}
      </Text>
    </View>
  );
}

function HeatmapBars({
  points,
  midPrice,
  height,
  symbol,
}: {
  points: LiquidityHeatmapResult['points'];
  midPrice?: number | null;
  height: number;
  symbol: string;
}) {
  const prices = points.map((p) => p.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const pad = Math.max((maxP - minP) * 0.12, midPrice ? midPrice * 0.001 : 1);
  const lo = minP - pad;
  const hi = maxP + pad;
  const span = hi - lo || 1;
  const maxStrength = Math.max(...points.map((p) => p.strength), 1);

  return (
    <View style={[styles.chartWrap, { height }]}>
      {points.map((p, i) => {
        const yPct = 1 - (p.price - lo) / span;
        const barW = `${Math.min(95, (p.strength / maxStrength) * 90)}%` as ViewStyle['width'];
        const color =
          p.side === 'BID' ? COLORS.bullish : p.side === 'ASK' ? COLORS.bearish : COLORS.accent;
        return (
          <View key={`${p.price}-${i}`} style={[styles.barRow, { top: `${yPct * 92}%` }]}>
            <Text style={styles.barLabel}>{formatPrice(symbol, p.price)}</Text>
            <View style={[styles.barTrack, { width: barW, backgroundColor: color, opacity: 0.85 }]} />
            <Text style={styles.barMeta}>{p.strength.toFixed(1)}×</Text>
          </View>
        );
      })}
      {midPrice != null ? (
        <View style={[styles.midLine, { top: `${(1 - (midPrice - lo) / span) * 92}%` }]}>
          <Text style={styles.midLabel}>{vi.heatmap.lastPrice(formatPrice(symbol, midPrice))}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    ...PANEL,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    flex: 1,
    minWidth: 280,
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
  empty: {
    fontSize: 12,
    color: COLORS.textSecondary,
    paddingVertical: 24,
    textAlign: 'center',
  },
  chartWrap: {
    position: 'relative',
    width: '100%',
  },
  barRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 14,
    marginTop: -7,
  },
  barLabel: {
    width: 80,
    fontSize: 9,
    color: COLORS.textMuted,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  barTrack: {
    height: 6,
    borderRadius: 2,
    minWidth: 4,
  },
  barMeta: {
    fontSize: 9,
    color: COLORS.textSecondary,
    width: 36,
  },
  midLine: {
    position: 'absolute',
    left: 80,
    right: 0,
    height: 1,
    backgroundColor: COLORS.textMuted,
    opacity: 0.5,
  },
  midLabel: {
    position: 'absolute',
    right: 0,
    top: -10,
    fontSize: 9,
    color: COLORS.accent,
  },
  footer: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 10,
  },
});
