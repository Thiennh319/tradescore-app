import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../../constants/scoring';
import { RADIUS, SPACING } from '../../constants/theme';

interface EsmHintBadgeProps {
  badge: string;
  tooltipLines: readonly string[];
}

/** ESM hint badge — inline right of PA recommendation; tooltip on badge hover only (UL-03.3). */
export function EsmHintBadge({ badge, tooltipLines }: EsmHintBadgeProps) {
  const [hintHovered, setHintHovered] = useState(false);
  const showTooltip =
    Platform.OS === 'web' && hintHovered && tooltipLines.length > 0;

  const hintHoverHandlers =
    Platform.OS === 'web'
      ? {
          onMouseEnter: () => setHintHovered(true),
          onMouseLeave: () => setHintHovered(false),
        }
      : {};

  return (
    <View style={styles.hintWrap} {...hintHoverHandlers}>
      <Text style={styles.hintBadge} numberOfLines={1}>
        {badge}
      </Text>
      {showTooltip ? (
        <View style={styles.tooltip} pointerEvents="none">
          {tooltipLines.map((line) => (
            <Text key={line} style={styles.tooltipLine} numberOfLines={2}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

interface EsmRecommendationCellProps {
  recommendationLabel: string;
  recommendationColor: string;
  hintBadge: string | null;
  width: number;
  tooltipLines: readonly string[];
}

export function EsmRecommendationCell({
  recommendationLabel,
  recommendationColor,
  hintBadge,
  width,
  tooltipLines,
}: EsmRecommendationCellProps) {
  return (
    <View style={[styles.wrap, { width }]}>
      <View style={styles.recommendationRow}>
        <Text
          style={[styles.recommendation, { color: recommendationColor }]}
          numberOfLines={2}
        >
          {recommendationLabel}
        </Text>
        {hintBadge != null ? (
          <EsmHintBadge badge={hintBadge} tooltipLines={tooltipLines} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: SPACING.xs,
  },
  recommendationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: SPACING.xs,
  },
  recommendation: {
    flexShrink: 1,
    fontSize: 11,
    lineHeight: 15,
  },
  hintWrap: {
    position: 'relative',
    flexShrink: 0,
    zIndex: 1,
  },
  hintBadge: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 0.2,
  },
  tooltip: {
    position: 'absolute',
    left: 0,
    top: '100%',
    marginTop: 2,
    minWidth: 160,
    maxWidth: 260,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    backgroundColor: COLORS.surfaceElevated,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    zIndex: 20,
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
        } as object)
      : {}),
  },
  tooltipLine: {
    fontSize: 10,
    lineHeight: 14,
    color: COLORS.textPrimary,
  },
});
