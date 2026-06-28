import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../../constants/scoring';
import { vi } from '../../constants/vi';

export interface CVDChartProps {
  cvd: Float32Array;
  height?: number;
}

export function CVDChart({ cvd, height = 100 }: CVDChartProps) {
  const slice = Array.from(cvd).filter((v) => Number.isFinite(v));
  if (slice.length < 2) {
    return <Text style={styles.empty}>{vi.orderFlow.cvdInsufficient}</Text>;
  }

  const min = Math.min(...slice);
  const max = Math.max(...slice);
  const span = max - min || 1;
  const last = slice[slice.length - 1];

  return (
    <View>
      <View style={[styles.fallback, { height }]}>
        {slice.map((v, i) => {
          const h = ((v - min) / span) * (height - 16);
          const positive = v >= 0;
          return (
            <View
              key={i}
              style={[
                styles.col,
                {
                  height: Math.max(2, h),
                  backgroundColor: positive ? COLORS.bullish : COLORS.bearish,
                  opacity: 0.35 + (i / slice.length) * 0.65,
                },
              ]}
            />
          );
        })}
      </View>
      <Text style={styles.lastVal}>CVD {last.toFixed(1)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 1,
    paddingTop: 8,
  },
  col: {
    flex: 1,
    borderRadius: 1,
  },
  lastVal: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },
  empty: {
    fontSize: 11,
    color: COLORS.textMuted,
    paddingVertical: 12,
  },
});
