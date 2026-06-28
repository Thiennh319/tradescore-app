import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../constants/scoring';
import { RADIUS, SPACING } from '../constants/theme';
import {
  hasActiveBackupFile,
  isFileBackupSupported,
} from '../services/webFileBackup';
import { useTradeStore } from '../store/useTradeStore';

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

export function DataSyncPanel() {
  const lastSavedAt = useTradeStore((s) => s.lastSavedAt);
  const aiCount = useTradeStore((s) => s.aiTradeJournal.length);
  const exportFullBackup = useTradeStore((s) => s.exportFullBackup);
  const importFullBackup = useTradeStore((s) => s.importFullBackup);
  const enableAutoFileBackup = useTradeStore((s) => s.enableAutoFileBackup);
  const flushPersistedState = useTradeStore((s) => s.flushPersistedState);

  const [fileBackupOn, setFileBackupOn] = useState(hasActiveBackupFile);

  const savedLabel = lastSavedAt
    ? new Date(lastSavedAt).toLocaleString('vi-VN')
    : 'Chưa lưu';

  const onExport = () => {
    exportFullBackup();
    Alert.alert('Đã tải file', 'File JSON đã lưu vào thư mục Tải xuống.');
  };

  const onImport = async () => {
    const ok = await importFullBackup();
    Alert.alert(
      ok ? 'Khôi phục thành công' : 'Không khôi phục được',
      ok
        ? 'Dữ liệu từ file đã gộp vào app (journal, settings, checklist…).'
        : 'File không hợp lệ hoặc bạn đã hủy chọn file.',
    );
  };

  const onEnableFileSync = async () => {
    const ok = await enableAutoFileBackup();
    setFileBackupOn(ok && hasActiveBackupFile());
    Alert.alert(
      ok ? 'Auto-sao lưu file' : 'Không hỗ trợ',
      ok
        ? 'Mỗi lần thay đổi dữ liệu sẽ ghi vào file đã chọn — dùng được khi đổi port hoặc tab mới.'
        : 'Trình duyệt không hỗ trợ chọn file (dùng Chrome/Edge). Hoặc dùng nút Tải/Khôi phục JSON.',
    );
  };

  const onFlush = async () => {
    await flushPersistedState();
    Alert.alert('Đã lưu', 'Snapshot đã ghi vào mọi kho lưu trữ.');
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Sao lưu & đồng bộ dữ liệu</Text>
      <Text style={styles.meta}>
        {aiCount} lệnh journal · Lưu lúc {savedLabel}
      </Text>
      <Text style={styles.hint}>
        Web tự lưu localStorage + IndexedDB + tab sync. Đổi port: dùng cùng tab hoặc bật auto-file /
        khôi phục JSON.
      </Text>

      <View style={styles.row}>
        <SyncBtn label="Tải JSON" onPress={onExport} />
        <SyncBtn label="Khôi phục JSON" onPress={() => void onImport()} />
        <SyncBtn label="Lưu ngay" onPress={() => void onFlush()} />
      </View>

      {Platform.OS === 'web' && isFileBackupSupported() ? (
        <Pressable
          onPress={() => void onEnableFileSync()}
          style={[styles.fileBtn, fileBackupOn && styles.fileBtnOn, webPointer]}
        >
          <Text style={[styles.fileBtnText, fileBackupOn && styles.fileBtnTextOn]}>
            {fileBackupOn ? '✓ Auto-file đang bật' : 'Bật auto-sao lưu file (đổi port)'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function SyncBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.btn, webPointer]}>
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: SPACING.md,
    padding: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: 'rgba(255,255,255,0.02)',
    gap: SPACING.sm,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  meta: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  hint: {
    fontSize: 10,
    color: COLORS.textMuted,
    lineHeight: 14,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  btn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.accent,
  },
  fileBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
  },
  fileBtnOn: {
    borderColor: COLORS.bullish,
    backgroundColor: 'rgba(14, 203, 129, 0.06)',
  },
  fileBtnText: {
    fontSize: 10,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  fileBtnTextOn: {
    color: COLORS.bullish,
    fontWeight: '600',
  },
});
