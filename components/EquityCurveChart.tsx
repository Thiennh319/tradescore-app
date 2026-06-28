import { useMemo } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../constants/scoring';
import { RADIUS, SPACING } from '../constants/theme';
import type { EquityCurveChartData, EquityCurveStats } from '../services/journalService';

const CHART_HEIGHT = 200;
const CHART_PADDING = { top: 12, bottom: 24, left: 8, right: 72 };

interface EquityCurveChartProps {
  data: EquityCurveChartData;
  stats: EquityCurveStats;
  /** Nhãn trục X — mặc định Start / L1, L2… */
  labelAt?: (index: number) => string;
}

function valueToY(value: number, min: number, max: number, plotHeight: number): number {
  if (max <= min) return plotHeight / 2;
  return plotHeight - ((value - min) / (max - min)) * plotHeight;
}

function LineSegment({
  x0,
  y0,
  x1,
  y1,
  color,
  dashed,
}: {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: string;
  dashed?: boolean;
}) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length < 0.5) return null;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

  return (
    <View
      style={[
        styles.segment,
        {
          left: x0,
          top: y0,
          width: length,
          backgroundColor: color,
          transform: [{ rotate: `${angle}deg` }],
          opacity: dashed ? 0.75 : 1,
        },
        dashed && styles.segmentDashed,
      ]}
    />
  );
}

export function EquityCurveChart({ data, stats, labelAt }: EquityCurveChartProps) {
  const screenWidth = Dimensions.get('window').width;
  const chartWidth = screenWidth - 32;

  const layout = useMemo(() => {
    const values = data.chartPoints.map((p) => p.value);
    const minVal = Math.min(...values, data.baselineLine, data.targetLine);
    const maxVal = Math.max(...values, data.baselineLine, data.targetLine);
    const pad = Math.max((maxVal - minVal) * 0.08, 0.5);
    const min = minVal - pad;
    const max = maxVal + pad;

    const plotWidth = chartWidth - CHART_PADDING.left - CHART_PADDING.right;
    const plotHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
    const count = data.chartPoints.length;

    const points = data.chartPoints.map((p, i) => {
      const x =
        count <= 1
          ? CHART_PADDING.left + plotWidth / 2
          : CHART_PADDING.left + (i / (count - 1)) * plotWidth;
      const y = CHART_PADDING.top + valueToY(p.value, min, max, plotHeight);
      return { ...p, x, y, index: i };
    });

    const baselineY =
      CHART_PADDING.top + valueToY(data.baselineLine, min, max, plotHeight);
    const targetY =
      CHART_PADDING.top + valueToY(data.targetLine, min, max, plotHeight);

    return { points, min, max, plotWidth, plotHeight, baselineY, targetY };
  }, [chartWidth, data]);

  const lineColor = data.isPositive ? COLORS.bullish : COLORS.bearish;
  const currentPositive = stats.currentValue >= stats.startValue;
  const ddWarn = stats.maxDrawdown >= 10;

  const resolveLabel = labelAt ?? ((i: number) => (i === 0 ? 'Bắt đầu' : `L${i}`));

  return (
    <View style={styles.wrap}>
      <View style={[styles.chartBox, { width: chartWidth, height: CHART_HEIGHT }]}>
        <LineSegment
          x0={CHART_PADDING.left}
          y0={layout.baselineY}
          x1={CHART_PADDING.left + layout.plotWidth}
          y1={layout.baselineY}
          color={COLORS.textSecondary}
          dashed
        />
        <LineSegment
          x0={CHART_PADDING.left}
          y0={layout.targetY}
          x1={CHART_PADDING.left + layout.plotWidth}
          y1={layout.targetY}
          color={COLORS.accent}
          dashed
        />
        <Text style={[styles.refLabel, { top: layout.targetY - 8 }]}>
          Mục tiêu 100$
        </Text>

        {layout.points.map((pt, i) => {
          if (i === 0) return null;
          const prev = layout.points[i - 1];
          return (
            <LineSegment
              key={`seg-${pt.index}`}
              x0={prev.x}
              y0={prev.y}
              x1={pt.x}
              y1={pt.y}
              color={lineColor}
            />
          );
        })}

        {layout.points.map((pt) => (
          <View key={`dot-${pt.index}`} style={[styles.dotWrap, { left: pt.x - 5, top: pt.y - 5 }]}>
            <View style={[styles.dot, { backgroundColor: lineColor }]} />
            <Text style={styles.pnlTag}>
              {pt.pnl >= 0 ? `+${pt.pnl.toFixed(2)}` : pt.pnl.toFixed(2)}
            </Text>
          </View>
        ))}

        <View style={styles.xAxis}>
          {layout.points.map((pt) => (
            <Text
              key={`lbl-${pt.index}`}
              style={[styles.xLabel, { left: pt.x - 14 }]}
              numberOfLines={1}
            >
              {resolveLabel(pt.index)}
            </Text>
          ))}
        </View>
      </View>

      <View style={styles.statsRow}>
        <StatCell
          label="Bắt đầu"
          value={`${stats.startValue.toFixed(1)}$`}
        />
        <StatCell
          label="Hiện tại"
          value={`${stats.currentValue.toFixed(1)}$`}
          valueColor={currentPositive ? COLORS.bullish : COLORS.bearish}
        />
        <StatCell
          label="Drawdown"
          value={`max ${stats.maxDrawdown.toFixed(1)}%`}
          valueColor={ddWarn ? COLORS.bearish : COLORS.accent}
        />
        <View style={styles.progressCell}>
          <Text style={styles.statLabel}>Tiến độ</Text>
          <Text style={styles.progressPct}>{stats.progressPct.toFixed(0)}%</Text>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.min(100, Math.max(0, stats.progressPct))}%`,
                  backgroundColor:
                    stats.progressPct >= 50 ? COLORS.bullish : COLORS.bearish,
                },
              ]}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

function StatCell({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: SPACING.sm },
  chartBox: {
    position: 'relative',
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  segment: {
    position: 'absolute',
    height: 2,
    transformOrigin: 'left center',
  },
  segmentDashed: {
    height: 1,
    opacity: 0.65,
  },
  refLabel: {
    position: 'absolute',
    right: 4,
    fontSize: 8,
    fontWeight: '700',
    color: COLORS.accent,
  },
  dotWrap: {
    position: 'absolute',
    width: 10,
    height: 10,
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.surface,
  },
  pnlTag: {
    position: 'absolute',
    top: -14,
    fontSize: 7,
    fontWeight: '700',
    color: COLORS.textMuted,
    width: 40,
    textAlign: 'center',
  },
  xAxis: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 4,
    height: 16,
  },
  xLabel: {
    position: 'absolute',
    width: 28,
    fontSize: 7,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  statCell: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 6,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 8,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  statValue: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  progressCell: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 6,
    alignItems: 'center',
  },
  progressPct: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  progressTrack: {
    width: '100%',
    height: 4,
    backgroundColor: COLORS.surface,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
});
