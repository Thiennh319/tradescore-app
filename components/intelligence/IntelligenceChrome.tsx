/**
 * Phase 14 — Shared compact intelligence panel chrome (no redesign).
 */
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../../constants/scoring';
import { PANEL, RADIUS, SPACING } from '../../constants/theme';

export function IntelligencePanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>{title}</Text>
      {children}
    </View>
  );
}

export function IntelRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

export function IntelLine({ text }: { text: string }) {
  return <Text style={styles.line}>{text}</Text>;
}

function fmtWr(v: number | null): string {
  return v == null ? '—' : `${v.toFixed(1)}%`;
}

export function WinrateList({
  rows,
  limit = 6,
}: {
  rows: { key: string; trades: number; winRate: number | null }[];
  limit?: number;
}) {
  if (rows.length === 0) {
    return <IntelLine text="Chưa đủ dữ liệu" />;
  }
  return (
    <>
      {rows.slice(0, limit).map((r) => (
        <IntelRow
          key={r.key}
          label={r.key}
          value={`${fmtWr(r.winRate)} · n=${r.trades}`}
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  panel: {
    ...PANEL,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  title: {
    color: COLORS.textPrimary,
    fontWeight: '700',
    fontSize: 13,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  label: { color: COLORS.textMuted, fontSize: 12, flex: 1 },
  value: { color: COLORS.textSecondary, fontSize: 12, flexShrink: 1, textAlign: 'right' },
  line: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18 },
});
