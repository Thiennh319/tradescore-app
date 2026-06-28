import React, { useState } from 'react';
import {
  LayoutAnimation,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type {
  PositionRecommendation,
  RecommendationType,
} from '../services/positionAdvisorV3';

const URGENCY_BORDER: Record<PositionRecommendation['urgency'], string> = {
  CRITICAL: '#F6465D',
  HIGH: '#F6465D',
  MEDIUM: '#F0B90B',
  LOW: '#2B3139',
};

const DOT_COUNT = 5;
const DOT_INACTIVE = '#2B3139';

const ACTION_LABELS: Partial<Record<RecommendationType, string>> = {
  HOLD_MOVE_SL: 'Dời SL về Entry',
  PARTIAL_TP1: 'Chốt 50% ngay',
  PARTIAL_TP2: 'Chốt thêm 30%',
  PARTIAL_CLOSE_30: 'Chốt 30% ngay',
  CLOSE_NOW: 'Đóng lệnh',
  CLOSE_URGENT: 'Đóng ngay',
  CLOSE_REVERSE: 'Đóng / chốt (đảo chiều)',
};

interface PositionRecommendationWidgetProps {
  recommendation: PositionRecommendation;
  onAction?: (type: RecommendationType) => void;
  onUserView?: () => void;
  isLoading?: boolean;
}

function borderColorForUrgency(urgency: PositionRecommendation['urgency']): string {
  return URGENCY_BORDER[urgency];
}

function actionLabel(type: RecommendationType): string {
  return ACTION_LABELS[type] ?? type;
}

export function PositionRecommendationWidget({
  recommendation: rec,
  onAction,
  onUserView,
  isLoading = false,
}: PositionRecommendationWidgetProps) {
  const [expanded, setExpanded] = useState(false);
  const filledDots = Math.round(rec.confidence / 20);
  const isCritical = rec.urgency === 'CRITICAL';
  const showAction = rec.type !== 'HOLD' && onAction != null;
  const actionText = actionLabel(rec.type);

  const toggleExpanded = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => {
      const next = !prev;
      if (next) onUserView?.();
      return next;
    });
  };

  return (
    <View
      style={[
        styles.container,
        { borderLeftColor: borderColorForUrgency(rec.urgency) },
        isCritical && styles.containerCritical,
      ]}
    >
      <TouchableOpacity
        style={styles.mainRow}
        onPress={toggleExpanded}
        activeOpacity={0.75}
      >
        <Text style={styles.sectionLabel}>KHUYẾN NGHỊ</Text>

        <View style={styles.mainRight}>
          {isLoading ? (
            <Text style={styles.loadingText}>Đang phân tích...</Text>
          ) : (
            <>
              {rec.gracePeriodActive && rec.graceMinutesOpen != null ? (
                <View style={styles.graceBadge}>
                  <Text style={styles.graceBadgeText}>
                    Mới mở {rec.graceMinutesOpen}p — đang theo dõi
                  </Text>
                </View>
              ) : null}
              <View style={styles.dotsRow}>
                {Array.from({ length: DOT_COUNT }, (_, index) => (
                  <View
                    key={index}
                    style={[
                      styles.dot,
                      { backgroundColor: index < filledDots ? rec.color : DOT_INACTIVE },
                    ]}
                  />
                ))}
              </View>
              <Text style={[styles.labelText, { color: rec.color }]}>{rec.label}</Text>
              <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
            </>
          )}
        </View>
      </TouchableOpacity>

      {expanded && !isLoading ? (
        <View style={styles.expanded}>
          <View style={styles.divider} />

          {rec.reasons.map((reason, index) => (
            <View key={`${index}-${reason}`} style={styles.reasonRow}>
              <Text style={[styles.bullet, { color: rec.color }]}>•</Text>
              <Text style={styles.reasonText}>{reason}</Text>
            </View>
          ))}

          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${rec.confidence}%`, backgroundColor: rec.color },
              ]}
            />
          </View>
          <Text style={styles.confidenceText}>
            Độ tin cậy: {rec.confidence}% · {rec.triggeredBy} ({rec.matchedRuleCount} rule)
          </Text>

          {showAction ? (
            <TouchableOpacity
              style={[
                styles.actionBtn,
                { borderColor: rec.color },
                isCritical && { backgroundColor: rec.color },
              ]}
              onPress={() => onAction(rec.type)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.actionText,
                  { color: isCritical ? '#000' : rec.color },
                ]}
              >
                {isCritical ? `⚡ ${actionText}` : actionText}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1E2329',
    borderRadius: 8,
    borderLeftWidth: 3,
    overflow: 'hidden',
  },
  containerCritical: {
    shadowColor: '#F6465D',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 8,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  sectionLabel: {
    color: '#848E9C',
    fontSize: 11,
    letterSpacing: 1,
    fontWeight: '600',
  },
  mainRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    flexWrap: 'wrap',
  },
  graceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: 'rgba(240, 185, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(240, 185, 11, 0.45)',
  },
  graceBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#F0B90B',
  },
  loadingText: {
    color: '#848E9C',
    fontSize: 12,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  labelText: {
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  chevron: {
    color: '#848E9C',
    fontSize: 10,
  },
  expanded: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
  },
  divider: {
    height: 1,
    backgroundColor: '#2B3139',
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  bullet: {
    fontSize: 12,
    lineHeight: 18,
  },
  reasonText: {
    flex: 1,
    color: '#EAECEF',
    fontSize: 12,
    lineHeight: 18,
  },
  progressTrack: {
    height: 4,
    backgroundColor: '#2B3139',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
  },
  confidenceText: {
    textAlign: 'right',
    color: '#848E9C',
    fontSize: 10,
  },
  actionBtn: {
    borderWidth: 1.5,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
