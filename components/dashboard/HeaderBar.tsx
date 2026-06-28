import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../../constants/scoring';
import { SPACING } from '../../constants/theme';
import { vi } from '../../constants/vi';
import { disableTradeApp, enableTradeApp, useTradeAppState } from '../../store/useTradeAppState';
import { SyncStatusBadge } from '../SyncStatusBadge';
import type { SyncState } from '../../types/driveSync';
import { DisableTradeConfirmModal } from './DisableTradeConfirmModal';

interface HeaderBarProps {
  timezone: string;
  refreshInterval: number;
  isLive?: boolean;
  tierName: string;
  onTierPress?: () => void;
  syncState?: SyncState;
}

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

export function HeaderBar({
  timezone,
  refreshInterval,
  isLive = true,
  tierName,
  onTierPress,
  syncState,
}: HeaderBarProps) {
  const [disableConfirmOpen, setDisableConfirmOpen] = useState(false);
  const tradeAppEnabled = useTradeAppState((s) => s.tradeAppEnabled);
  const statusColor = isLive ? COLORS.bullish : COLORS.warning;
  const statusText = isLive ? vi.header.systemLive : vi.header.systemReady;
  const tradeToggleLabel = tradeAppEnabled ? 'Disable Trade' : 'Active Trade';
  const tradeToggleStyle = tradeAppEnabled ? styles.tradeToggleDisable : styles.tradeToggleActive;
  const tradeToggleTextStyle = tradeAppEnabled
    ? styles.tradeToggleDisableText
    : styles.tradeToggleActiveText;

  const handleDisableConfirm = () => {
    disableTradeApp();
    setDisableConfirmOpen(false);
  };

  const handleActiveTrade = () => {
    enableTradeApp();
    setDisableConfirmOpen(false);
  };

  useEffect(() => {
    if (tradeAppEnabled) setDisableConfirmOpen(false);
  }, [tradeAppEnabled]);

  return (
    <View style={[styles.wrap, !tradeAppEnabled && styles.wrapWhenLocked]}>
      <View style={styles.bar}>
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>TS</Text>
          </View>
          <View>
            <Text style={styles.title}>{vi.header.title}</Text>
            <Text style={styles.tagline}>{vi.header.tagline}</Text>
          </View>
          <Pressable
            style={[styles.tradeToggleButton, tradeToggleStyle, webPointer]}
            accessibilityLabel={tradeToggleLabel}
            onPress={() => {
              if (tradeAppEnabled) setDisableConfirmOpen(true);
              else handleActiveTrade();
            }}
          >
            <Text style={[styles.tradeToggleText, tradeToggleTextStyle]}>
              {tradeToggleLabel}
            </Text>
          </Pressable>
        </View>

        <View style={styles.meta}>
          <View style={[styles.statusPill, { borderColor: statusColor }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
          </View>
          <Text style={styles.metaText}>{timezone}</Text>
          <Text style={styles.metaDivider}>·</Text>
          <Text style={styles.metaText}>{vi.header.refreshSec(refreshInterval)}</Text>
          {syncState ? <SyncStatusBadge syncState={syncState} /> : null}
          <Pressable
            onPress={tradeAppEnabled ? onTierPress : undefined}
            disabled={!tradeAppEnabled}
            style={[
              styles.phaseBadge,
              webPointer,
              !tradeAppEnabled && styles.phaseBadgeDisabled,
            ]}
            accessibilityLabel={vi.signalBoard.tierBadgeHint}
          >
            <Text style={styles.phaseText}>{vi.header.tierBadge(tierName)}</Text>
          </Pressable>
        </View>
      </View>

      <DisableTradeConfirmModal
        visible={disableConfirmOpen}
        onConfirm={handleDisableConfirm}
        onCancel={() => setDisableConfirmOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    position: 'relative',
    zIndex: 100,
    elevation: 8,
  },
  wrapWhenLocked: {
    zIndex: 10000,
    elevation: 10000,
  },
  bar: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
    gap: SPACING.md,
    flexWrap: 'wrap',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  logo: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.background,
    letterSpacing: -0.5,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: -0.3,
  },
  tagline: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  tradeToggleButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    marginLeft: SPACING.sm,
  },
  tradeToggleText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  tradeToggleActive: {
    borderColor: COLORS.bullish,
    backgroundColor: COLORS.background,
  },
  tradeToggleActiveText: {
    color: COLORS.bullish,
  },
  tradeToggleDisable: {
    borderColor: COLORS.bearish,
    backgroundColor: COLORS.background,
  },
  tradeToggleDisableText: {
    color: COLORS.bearish,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.background,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  metaText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  metaDivider: {
    fontSize: 11,
    color: COLORS.border,
  },
  phaseBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.accent,
    backgroundColor: COLORS.background,
  },
  phaseText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.accent,
    letterSpacing: 0.5,
  },
  phaseBadgeDisabled: {
    opacity: 0.45,
  },
});
