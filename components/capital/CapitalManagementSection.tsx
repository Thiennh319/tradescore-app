import { useCallback, useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { COLORS } from '../../constants/scoring';
import { PANEL, RADIUS, SPACING } from '../../constants/theme';
import { vi } from '../../constants/vi';
import {
  computeMilestoneProgress,
  computeRemainingToMilestone,
  formatCapitalUsd,
  parseCapitalInput,
  calculateCapitalTier,
} from '../../services/capitalManagement';
import { useTradeStore } from '../../store/useTradeStore';
import { CapitalTierCard } from './CapitalTierCard';

interface CapitalManagementSectionProps {
  autoFocus?: boolean;
  onCapitalUpdated?: () => void;
}

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

export function CapitalManagementSection({
  autoFocus = false,
  onCapitalUpdated,
}: CapitalManagementSectionProps) {
  const capitalManagement = useTradeStore((s) => s.capitalManagement);
  const updateCapital = useTradeStore((s) => s.updateCapital);
  const [draft, setDraft] = useState(formatCapitalUsd(capitalManagement.currentCapital));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(formatCapitalUsd(capitalManagement.currentCapital));
  }, [capitalManagement.currentCapital]);

  const { currentTier, currentCapital, initialCapital, lastMilestoneCapital } =
    capitalManagement;
  const milestoneBaseline = calculateCapitalTier(lastMilestoneCapital, initialCapital);
  const milestoneTarget = milestoneBaseline.nextMilestone;
  const nextTierName = calculateCapitalTier(milestoneTarget, initialCapital).tierName;
  const progress = computeMilestoneProgress(
    currentCapital,
    lastMilestoneCapital,
    milestoneTarget,
  );
  const remaining = computeRemainingToMilestone(currentCapital, milestoneTarget);

  const handleUpdate = useCallback(async () => {
    const parsed = parseCapitalInput(draft);
    if (parsed == null) {
      setError(vi.capital.invalidInput);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await updateCapital(parsed);
      onCapitalUpdated?.();
    } finally {
      setSaving(false);
    }
  }, [draft, onCapitalUpdated, updateCapital]);

  return (
    <View style={styles.wrap} nativeID="capital-management-section">
      <Text style={styles.sectionTitle}>💰 {vi.capital.sectionTitle}</Text>

      <View style={styles.panel}>
        <Text style={styles.label}>{vi.capital.currentCapitalLabel}</Text>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={(t) => {
            setDraft(t);
            setError(null);
          }}
          keyboardType="decimal-pad"
          autoFocus={autoFocus}
          placeholder="0.00"
          placeholderTextColor={COLORS.textMuted}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.metaBlock}>
          <Text style={styles.meta}>
            {vi.capital.initialCapital}: ${formatCapitalUsd(initialCapital)}
          </Text>
          <Text style={styles.meta}>
            {vi.capital.nextMilestone}: ${formatCapitalUsd(milestoneTarget)} (+30%)
          </Text>
          <Text style={styles.meta}>
            {vi.capital.remaining}: ${formatCapitalUsd(remaining)} USDT
          </Text>
        </View>

        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.progressLabel}>
            {progress.toFixed(0)}% {vi.capital.progressTo(nextTierName)}
          </Text>
        </View>

        <Pressable
          style={[styles.btn, saving && styles.btnDisabled, webPointer]}
          disabled={saving}
          onPress={() => void handleUpdate()}
        >
          <Text style={styles.btnText}>{vi.capital.updateBtn}</Text>
        </Pressable>
      </View>

      <CapitalTierCard tier={currentTier} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: SPACING.md,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: 0.5,
  },
  panel: {
    ...PANEL,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  input: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  error: {
    fontSize: 11,
    color: COLORS.bearish,
  },
  metaBlock: {
    gap: 4,
    marginTop: SPACING.xs,
  },
  meta: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontVariant: ['tabular-nums'],
  },
  progressWrap: {
    gap: 6,
    marginVertical: SPACING.sm,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.background,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.accent,
    borderRadius: 4,
  },
  progressLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  btn: {
    backgroundColor: COLORS.accent,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#02110A',
  },
});
