import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { RADIUS } from '../constants/theme';
import type { FinalEntryDisplay } from '../services/finalEntryStatus';

const AMBIGUOUS_BADGE_COLOR = '#D97706';

interface FinalEntryBadgeProps {
  display: FinalEntryDisplay;
  score?: number | null;
  maxScore?: number;
  size?: 'sm' | 'md' | 'lg';
  isAmbiguousDirection?: boolean;
}

export function FinalEntryBadge({
  display,
  score,
  maxScore = 15,
  size = 'md',
  isAmbiguousDirection,
}: FinalEntryBadgeProps) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isAmbiguousDirection || !display.pulse) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.55, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [display.pulse, isAmbiguousDirection, pulse]);

  const sizeStyle = size === 'lg' ? styles.lg : size === 'sm' ? styles.sm : styles.md;
  const textSize = size === 'lg' ? styles.textLg : size === 'sm' ? styles.textSm : styles.textMd;

  if (isAmbiguousDirection) {
    return (
      <View
        style={[
          styles.badge,
          sizeStyle,
          {
            borderColor: AMBIGUOUS_BADGE_COLOR,
            backgroundColor: `${AMBIGUOUS_BADGE_COLOR}1A`,
          },
        ]}
      >
        <Text style={[styles.text, textSize, { color: AMBIGUOUS_BADGE_COLOR }]}>
          ⚠️ Chờ xu hướng rõ
        </Text>
      </View>
    );
  }

  const color = display.borderColor;

  const badge = (
    <View
      style={[
        styles.badge,
        sizeStyle,
        { borderColor: color, backgroundColor: `${color}1A` },
      ]}
    >
      <Text style={[styles.text, textSize, { color }]}>{display.label}</Text>
      {score != null ? (
        <Text style={[styles.score, { color }]}>
          {score.toFixed(1)} / {maxScore}
        </Text>
      ) : null}
      {display.subtitle ? (
        <Text style={[styles.subtitle, { color }]}>{display.subtitle}</Text>
      ) : null}
    </View>
  );

  if (!display.pulse) return badge;

  return <Animated.View style={{ opacity: pulse }}>{badge}</Animated.View>;
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 2,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  sm: { paddingHorizontal: 8, paddingVertical: 4 },
  md: { paddingHorizontal: 12, paddingVertical: 6 },
  lg: { paddingHorizontal: 16, paddingVertical: 10 },
  text: { fontWeight: '800', textAlign: 'center' },
  textSm: { fontSize: 11 },
  textMd: { fontSize: 13 },
  textLg: { fontSize: 16 },
  score: {
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  subtitle: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 14,
    marginTop: 2,
  },
});
