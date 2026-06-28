import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../constants/scoring';
import { RADIUS, SPACING } from '../constants/theme';
import {
  SQUEEZE_COMPONENT_KEYS,
  SQUEEZE_COMPONENT_LABELS,
  SQUEEZE_LEVEL_COLORS,
  SQUEEZE_LEVEL_LABELS,
} from '../services/squeezeRiskUi';
import type { SqueezeRiskResult } from '../types/squeezeRisk';

export interface L11LayerExpandV4Props {
  squeezeRisk: SqueezeRiskResult;
}

function levelEmoji(level: SqueezeRiskResult['level']): string {
  switch (level) {
    case 'LOW':
      return '🟢';
    case 'MEDIUM':
      return '🟡';
    case 'HIGH':
      return '🟠';
    case 'EXTREME':
      return '🔴';
    default:
      return '';
  }
}

function ComponentBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(1, value / 2));
  const filled = Math.round(pct * 6);
  const empty = 6 - filled;
  const bar = `${'█'.repeat(filled)}${'░'.repeat(empty)}`;

  return (
    <View style={styles.componentRow} testID={`l11-component-${label.replace(/\s+/g, '-').toLowerCase()}`}>
      <Text style={styles.componentLabel} numberOfLines={1}>
        {label}:
      </Text>
      <Text style={styles.componentBar} testID={`l11-bar-${label.replace(/\s+/g, '-').toLowerCase()}`}>
        {bar} {value.toFixed(1)}
      </Text>
    </View>
  );
}

export function L11SqueezeExpandV4({ squeezeRisk }: L11LayerExpandV4Props) {
  const levelColor = SQUEEZE_LEVEL_COLORS[squeezeRisk.level];
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (squeezeRisk.level !== 'EXTREME') return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.45, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [squeezeRisk.level, pulse]);

  return (
    <View style={styles.wrap} testID="l11-squeeze-expand">
      <Text style={styles.title}>L11 Squeeze Risk</Text>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryText}>
          Score:{' '}
          <Text style={styles.summaryStrong}>
            {squeezeRisk.score}/10
          </Text>
        </Text>
        <Animated.Text
          style={[
            styles.levelText,
            { color: levelColor, opacity: squeezeRisk.level === 'EXTREME' ? pulse : 1 },
          ]}
          testID="l11-level-label"
        >
          Level: {levelEmoji(squeezeRisk.level)} {SQUEEZE_LEVEL_LABELS[squeezeRisk.level]}
        </Animated.Text>
      </View>
      <Text style={styles.directionText} testID="l11-direction">
        Direction: {squeezeRisk.direction}
      </Text>
      <Text style={styles.sectionTitle}>Chi tiết:</Text>
      {SQUEEZE_COMPONENT_KEYS.map((key) => (
        <ComponentBar
          key={key}
          label={SQUEEZE_COMPONENT_LABELS[key]}
          value={squeezeRisk.components[key]}
        />
      ))}
      {squeezeRisk.reasons.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Lý do:</Text>
          {squeezeRisk.reasons.map((reason, i) => (
            <Text key={i} style={styles.reason}>
              • {reason}
            </Text>
          ))}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: SPACING.xs,
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceElevated,
    gap: 6,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
  },
  title: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 4,
  },
  summaryText: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  summaryStrong: {
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  levelText: {
    fontSize: 11,
    fontWeight: '800',
  },
  directionText: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginTop: 2,
  },
  componentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  componentLabel: {
    width: 118,
    fontSize: 10,
    color: COLORS.textMuted,
  },
  componentBar: {
    flex: 1,
    fontSize: 10,
    color: COLORS.textPrimary,
    fontFamily: 'monospace',
  },
  reason: {
    fontSize: 10,
    color: COLORS.textSecondary,
    lineHeight: 14,
  },
});
