import { StyleSheet, Text, View } from 'react-native';
import { RR_TARGETS } from '../../constants/capitalManagement';
import { COLORS } from '../../constants/scoring';
import { PANEL, RADIUS, SPACING } from '../../constants/theme';
import { vi } from '../../constants/vi';
import type { CapitalTier } from '../../services/capitalManagement';
import { formatCapitalUsd, tpMovePercent } from '../../services/capitalManagement';

interface CapitalTierCardProps {
  tier: CapitalTier;
}

export function CapitalTierCard({ tier }: CapitalTierCardProps) {
  const slPct = (tier.slDistancePercent * 100).toFixed(2);
  const tp1Pct = tpMovePercent(tier.slDistancePercent, RR_TARGETS.tp1).toFixed(2);
  const tp2Pct = tpMovePercent(tier.slDistancePercent, RR_TARGETS.tp2).toFixed(2);
  const tp3Pct = tpMovePercent(tier.slDistancePercent, RR_TARGETS.tp3).toFixed(2);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>
        🎯 {tier.tierName} — {vi.capital.tierActive}
      </Text>
      <View style={styles.table}>
        <Row label={vi.capital.sizePerTrade} value={`$${formatCapitalUsd(tier.sizePerTrade)} USDT`} />
        <Row
          label={vi.capital.notional}
          value={`$${formatCapitalUsd(tier.notionalPerTrade)} (5×)`}
        />
        <Row
          label={vi.capital.maxLossTrade}
          value={`$${formatCapitalUsd(tier.maxLossPerTrade)} USDT`}
        />
        <Row
          label={vi.capital.maxLossDay}
          value={`$${formatCapitalUsd(tier.maxLossPerDay)} USDT`}
        />
        <Row label={vi.capital.slDistance} value={`${slPct}% ${vi.capital.fromEntry}`} />
        <Row label={vi.capital.tp1} value={`entry ± ${tp1Pct}%`} />
        <Row label={vi.capital.tp2} value={`entry ± ${tp2Pct}%`} />
        <Row label={vi.capital.tp3} value={`entry ± ${tp3Pct}%`} />
      </View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...PANEL,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.accent,
    marginBottom: SPACING.xs,
  },
  table: {
    gap: SPACING.xs,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  label: {
    fontSize: 12,
    color: COLORS.textMuted,
    flex: 1,
  },
  value: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
});
