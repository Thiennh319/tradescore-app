import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../../constants/scoring';
import { SPACING } from '../../constants/theme';
import type { EsmUlReviewExplanationPanel } from '../../utils/esmUlReviewExplanation';
import type { UlReviewRiskLevel } from '../../utils/esmUlReviewExecutiveSummary';

interface UlReviewExplanationContentProps {
  panel: EsmUlReviewExplanationPanel;
  /** Compact popover vs full mobile sheet. */
  variant?: 'popover' | 'sheet';
}

function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

function MetricInline({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <Text style={styles.metricInline}>
      <Text style={styles.metricInlineLabel}>{label} : </Text>
      <Text style={[styles.metricInlineValue, valueColor ? { color: valueColor } : null]}>
        {value}
      </Text>
    </Text>
  );
}

function BulletList({
  items,
  prefix,
  tone,
}: {
  items: readonly string[];
  prefix: string;
  tone: 'positive' | 'warning' | 'neutral';
}) {
  if (items.length === 0) return null;
  const color =
    tone === 'positive'
      ? COLORS.bullish
      : tone === 'warning'
        ? COLORS.warning
        : COLORS.textSecondary;
  return (
    <View style={styles.listBlock}>
      {items.map((item) => (
        <View key={item} style={styles.listRow}>
          <Text style={[styles.listPrefix, { color }]}>{prefix}</Text>
          <Text style={styles.listText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function riskLevelColor(level: UlReviewRiskLevel): string {
  if (level === 'LOW') return COLORS.bullish;
  if (level === 'MODERATE') return COLORS.warning;
  if (level === 'HIGH') return '#F97316';
  return COLORS.bearish;
}

function riskLevelLabel(level: UlReviewRiskLevel): string {
  if (level === 'LOW') return 'THẤP';
  if (level === 'MODERATE') return 'TRUNG BÌNH';
  if (level === 'HIGH') return 'CAO';
  return 'NGUY HIỂM';
}

function ExecutiveSummaryView({
  panel,
  compact,
}: {
  panel: EsmUlReviewExplanationPanel;
  compact: boolean;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const summary = panel.executiveSummary;

  if (!summary) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.header}>ĐÁNH GIÁ UL</Text>
        <Text style={styles.fallbackText}>{panel.recommendation}</Text>
      </View>
    );
  }

  return (
    <>
      <View style={styles.decisionHeader}>
        <Text style={styles.decisionBadge}>{summary.decisionBadge}</Text>
        <Text style={styles.decisionTitle}>{summary.decisionTitle}</Text>
        {summary.confidence != null ? (
          <MetricInline label="Độ tin cậy" value={`${summary.confidence}%`} />
        ) : null}
        <MetricInline
          label="Mức rủi ro"
          value={riskLevelLabel(summary.riskLevel)}
          valueColor={riskLevelColor(summary.riskLevel)}
        />
      </View>

      {summary.whyReasons.length > 0 ? (
        <View style={styles.section}>
          <SectionTitle>Vì sao hệ thống đưa ra khuyến nghị này?</SectionTitle>
          <BulletList items={summary.whyReasons} prefix="•" tone="positive" />
        </View>
      ) : null}

      {summary.watchOut.length > 0 ? (
        <View style={styles.section}>
          <SectionTitle>Điều cần lưu ý</SectionTitle>
          <BulletList items={summary.watchOut} prefix="⚠" tone="warning" />
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionTitle>Hành động đề xuất</SectionTitle>
        <Text style={styles.nextAction}>{summary.nextAction}</Text>
      </View>

      {panel.updatedAt ? (
        <Text style={styles.updatedAt}>Cập nhật {panel.updatedAt}</Text>
      ) : null}

      <Pressable
        onPress={() => setAdvancedOpen((open) => !open)}
        style={styles.advancedToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: advancedOpen }}
      >
        <Text style={styles.advancedToggleText}>
          {advancedOpen ? '▲' : '▼'} Phân tích kỹ thuật chi tiết
        </Text>
      </Pressable>

      {advancedOpen ? (
        <View style={styles.advancedBlock}>
          {summary.advancedDiagnostics.map((line) => (
            <Text key={line} style={styles.advancedLine}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}

      {!compact && advancedOpen && summary.advancedDiagnostics.length === 0 ? (
        <Text style={styles.advancedEmpty}>Chưa có dữ liệu phân tích kỹ thuật.</Text>
      ) : null}
    </>
  );
}

export function UlReviewExplanationContent({
  panel,
  variant = 'popover',
}: UlReviewExplanationContentProps) {
  const compact = variant === 'popover';

  return (
    <ScrollView
      style={[styles.scroll, compact && styles.scrollCompact]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator
      nestedScrollEnabled
    >
      <ExecutiveSummaryView panel={panel} compact={compact} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    maxHeight: 420,
  },
  scrollCompact: {
    maxHeight: 380,
  },
  scrollContent: {
    paddingBottom: SPACING.xs,
    gap: SPACING.sm,
  },
  header: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
    color: COLORS.textMuted,
    marginBottom: SPACING.xs,
  },
  fallback: {
    gap: SPACING.xs,
  },
  fallbackText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  decisionHeader: {
    gap: 4,
    paddingBottom: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  decisionBadge: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textPrimary,
    lineHeight: 18,
  },
  decisionTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
  },
  metricInline: {
    fontSize: 11,
    lineHeight: 16,
  },
  metricInlineLabel: {
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  metricInlineValue: {
    color: COLORS.textPrimary,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  section: {
    gap: SPACING.xs,
    paddingTop: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
  },
  listBlock: {
    gap: 5,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.xs,
  },
  listPrefix: {
    fontSize: 11,
    lineHeight: 16,
    width: 14,
  },
  listText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    color: COLORS.textPrimary,
  },
  nextAction: {
    fontSize: 11,
    lineHeight: 16,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  updatedAt: {
    fontSize: 9,
    color: COLORS.textMuted,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  advancedToggle: {
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginTop: SPACING.xs,
  },
  advancedToggleText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: COLORS.textSecondary,
  },
  advancedBlock: {
    gap: 3,
    paddingBottom: SPACING.xs,
  },
  advancedLine: {
    fontSize: 10,
    lineHeight: 14,
    color: COLORS.textSecondary,
  },
  advancedEmpty: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
});
