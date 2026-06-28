import { StyleSheet, Text, View } from 'react-native';
import type { SyncState, SyncStatus } from '../types/driveSync';

export interface SyncStatusBadgeProps {
  syncState: SyncState;
}

export function formatSyncTime(isoTime: string | null): string {
  if (!isoTime) return '--';

  const date = new Date(isoTime);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const hours = parts.find((part) => part.type === 'hour')?.value ?? '00';
  const minutes = parts.find((part) => part.type === 'minute')?.value ?? '00';

  return `${hours}:${minutes}`;
}

export function getSyncConfig(
  status: SyncStatus,
  lastSyncTime: string | null,
): { icon: string; text: string; color: string } {
  switch (status) {
    case 'syncing':
      return {
        icon: '🔄',
        text: 'Đang sync...',
        color: '#F59E0B',
      };
    case 'success':
      return {
        icon: '✅',
        text: `Sync: ${formatSyncTime(lastSyncTime)}`,
        color: '#10B981',
      };
    case 'error':
      return {
        icon: '⚠️',
        text: 'Sync thất bại',
        color: '#EF4444',
      };
    case 'offline':
      return {
        icon: '📵',
        text: 'Offline',
        color: '#6B7280',
      };
    case 'idle':
    default:
      return {
        icon: '☁️',
        text: lastSyncTime ? `Sync: ${formatSyncTime(lastSyncTime)}` : 'Chưa sync',
        color: '#6B7280',
      };
  }
}

export function SyncStatusBadge({ syncState }: SyncStatusBadgeProps) {
  const config = getSyncConfig(syncState.status, syncState.lastSyncTime);

  return (
    <View
      style={[styles.badge, { backgroundColor: `${config.color}20` }]}
      testID="sync-status-badge"
    >
      <Text style={styles.icon}>{config.icon}</Text>
      <Text style={[styles.text, { color: config.color }]} testID="sync-status-text">
        {config.text}
      </Text>
      {syncState.pendingSync ? (
        <Text style={styles.pendingDot} testID="sync-pending-dot">
          •
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  icon: {
    fontSize: 12,
  },
  text: {
    fontSize: 11,
  },
  pendingDot: {
    color: '#F59E0B',
    fontSize: 10,
  },
});
