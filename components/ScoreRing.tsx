import { Platform, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../constants/scoring';

interface ScoreRingProps {
  /** Điểm hiện tại (vd 11.5) */
  score: number;
  /** Điểm tối đa (mặc định 15 cho Phase 4) */
  maxScore?: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  /** Nền lỗ tròn ở giữa */
  holeColor?: string;
  /** Nhãn nhỏ phía dưới số điểm */
  caption?: string;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Vòng tròn tiến trình biểu diễn điểm số (Phase 6). */
export function ScoreRing({
  score,
  maxScore = 15,
  size = 128,
  strokeWidth = 12,
  color = COLORS.accent,
  trackColor = COLORS.surfaceElevated,
  holeColor = COLORS.surface,
  caption,
}: ScoreRingProps) {
  const progress = clamp01(score / maxScore);
  const deg = progress * 360;
  const holeSize = size - strokeWidth * 2;

  const center = (
    <View style={[styles.hole, { width: holeSize, height: holeSize, borderRadius: holeSize / 2, backgroundColor: holeColor }]}>
      <Text style={[styles.score, { color }]}>{score.toFixed(1)}</Text>
      <Text style={styles.max}>/ {maxScore}</Text>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.wrap, { width: size, height: size }]}>
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: size / 2,
              // @ts-expect-error web-only CSS conic-gradient
              backgroundImage: `conic-gradient(${color} ${deg}deg, ${trackColor} ${deg}deg 360deg)`,
            },
          ]}
        />
        {center}
      </View>
    );
  }

  // Fallback native: vòng track + arc xấp xỉ bằng nửa vòng xoay
  const rotateFirst = Math.min(deg, 180);
  const rotateSecond = Math.max(deg - 180, 0);

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <View
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: size / 2, borderWidth: strokeWidth, borderColor: trackColor },
        ]}
      />
      <HalfArc size={size} stroke={strokeWidth} color={color} side="right" rotate={rotateFirst} />
      {deg > 180 ? (
        <HalfArc size={size} stroke={strokeWidth} color={color} side="left" rotate={rotateSecond} />
      ) : null}
      {center}
    </View>
  );
}

function HalfArc({
  size,
  stroke,
  color,
  side,
  rotate,
}: {
  size: number;
  stroke: number;
  color: string;
  side: 'left' | 'right';
  rotate: number;
}) {
  const clipStyle =
    side === 'right'
      ? { left: size / 2, width: size / 2, height: size }
      : { left: 0, width: size / 2, height: size };
  const ringLeft = side === 'right' ? -size / 2 : 0;
  const base = side === 'right' ? -135 : 45;

  return (
    <View style={[styles.clip, clipStyle]}>
      <View
        style={{
          position: 'absolute',
          left: ringLeft,
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: stroke,
          borderColor: 'transparent',
          borderTopColor: color,
          borderRightColor: color,
          transform: [{ rotate: `${base + rotate}deg` }],
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  clip: {
    position: 'absolute',
    top: 0,
    overflow: 'hidden',
  },
  hole: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  score: {
    fontSize: 26,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  max: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginTop: -2,
  },
  caption: {
    fontSize: 9,
    color: COLORS.textMuted,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
