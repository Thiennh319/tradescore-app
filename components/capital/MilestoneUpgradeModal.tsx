import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../../constants/scoring';
import { RADIUS, SPACING } from '../../constants/theme';
import { vi } from '../../constants/vi';
import type { MilestoneUpgradePreview } from '../../services/capitalManagement';
import { formatCapitalUsd } from '../../services/capitalManagement';

interface MilestoneUpgradeModalProps {
  visible: boolean;
  preview: MilestoneUpgradePreview | null;
  onConfirm: () => void;
}

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

export function MilestoneUpgradeModal({
  visible,
  preview,
  onConfirm,
}: MilestoneUpgradeModalProps) {
  if (!preview) return null;

  const { previousTier, newTier, toTierName, capitalAtUpgrade } = preview;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.emoji}>🎉</Text>
          <Text style={styles.title}>
            {vi.capital.milestoneTitle(toTierName)}
          </Text>
          <Text style={styles.subtitle}>
            {vi.capital.milestoneSubtitle(formatCapitalUsd(capitalAtUpgrade))}
          </Text>

          <Text style={styles.sectionLabel}>{vi.capital.milestoneApplied}</Text>
          <View style={styles.diffTable}>
            <DiffRow
              label={vi.capital.sizePerTrade}
              from={`$${formatCapitalUsd(previousTier.sizePerTrade)}`}
              to={`$${formatCapitalUsd(newTier.sizePerTrade)}`}
            />
            <DiffRow
              label={vi.capital.maxLossTrade}
              from={`$${formatCapitalUsd(previousTier.maxLossPerTrade)}`}
              to={`$${formatCapitalUsd(newTier.maxLossPerTrade)}`}
            />
            <DiffRow
              label={vi.capital.maxLossDay}
              from={`$${formatCapitalUsd(previousTier.maxLossPerDay)}`}
              to={`$${formatCapitalUsd(newTier.maxLossPerDay)}`}
            />
          </View>

          <Text style={styles.footer}>{vi.capital.milestoneContinue(toTierName)}</Text>

          <Pressable
            style={[styles.btn, webPointer]}
            onPress={onConfirm}
          >
            <Text style={styles.btnText}>{vi.capital.milestoneConfirm(toTierName)}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function DiffRow({
  label,
  from,
  to,
}: {
  label: string;
  from: string;
  to: string;
}) {
  return (
    <View style={styles.diffRow}>
      <Text style={styles.diffLabel}>{label}</Text>
      <Text style={styles.diffValue}>
        {from} → {to} USDT
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.accent,
    padding: SPACING.xl,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  emoji: {
    fontSize: 36,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.accent,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    alignSelf: 'flex-start',
    marginTop: SPACING.sm,
  },
  diffTable: {
    width: '100%',
    gap: SPACING.sm,
    marginVertical: SPACING.sm,
  },
  diffRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  diffLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    flex: 1,
  },
  diffValue: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  footer: {
    fontSize: 13,
    color: COLORS.bullish,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  btn: {
    marginTop: SPACING.lg,
    width: '100%',
    backgroundColor: COLORS.accent,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
  },
  btnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#02110A',
  },
});
