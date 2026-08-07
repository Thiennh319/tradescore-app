/**
 * V4.1 RC3 — Trade Session store.
 * Persist local + sync GitHub Gist (APK master / Web mirror). Không ghi Journal V3/V4.
 */

import { Platform } from 'react-native';
import { create } from 'zustand';
import type {
  V41TradeSession,
  V41TradeSessionAdvisor,
  V41TriggerType,
} from '../components/v41/v41Rc3Types';
import { symbolDisplayName } from '../components/v41/v41Rc3Types';
import { syncOnAction } from '../services/driveSyncService';
import { mergeDriveSyncStoreBridge } from '../services/driveSyncStoreBridge';
import { mergeByIdRemoteWins } from '../services/driveSyncMerge';
import { persistGetJson, persistSetJson } from '../services/persistStorage';
import { toAdvisorUpdatedAtUtc } from '../services/v41/rc3/adviserMetadata';
import type { V41SessionAdviserPatch } from '../services/v41/rc3/tradeSessionAdviserTypes';

const V41_SESSIONS_STORAGE_KEY = '@tradescore/v41_trade_sessions_v1';

type CreateSessionInput = {
  symbol: string;
  action: 'LONG' | 'SHORT';
  entry: number;
  stop: number;
  tp: number;
  tp2?: number;
  tp3?: number;
  triggerType: V41TriggerType | null;
};

type V41TradeSessionStore = {
  sessions: V41TradeSession[];
  hydrated: boolean;
  createSession: (input: CreateSessionInput) => V41TradeSession | null;
  updateSession: (
    id: string,
    patch: Partial<
      Pick<
        V41TradeSession,
        | 'status'
        | 'advisor'
        | 'advisorActionCode'
        | 'advisorReason'
        | 'advisorReasonCode'
        | 'advisorUpdatedAt'
        | 'advisorSequence'
        | 'advisorHistory'
        | 'current'
        | 'pnl'
        | 'stop'
        | 'tp'
      >
    >,
  ) => void;
  applyAdviserPatches: (patches: V41SessionAdviserPatch[]) => void;
  /** Kết thúc lệnh → status Closed (giữ lịch sử để sync), không xoá. */
  endSession: (id: string) => void;
  clearAll: () => void;
  /** True nếu coin đang Pending / Running. */
  hasActiveSession: (symbol: string) => boolean;
  hydrate: () => Promise<void>;
  /**
   * Web mirror / APK empty-push restore — MERGE theo id (remote thắng khi trùng).
   * Giữ session local-only (vd Closed) khi remote không gửi. Alias lịch sử: replaceSessionsFromRemote.
   */
  mergeSessionsFromRemote: (remote: V41TradeSession[]) => Promise<number>;
  /** @deprecated dùng mergeSessionsFromRemote — giữ tên cũ cho bridge/tests */
  replaceSessionsFromRemote: (remote: V41TradeSession[]) => Promise<number>;
};

function makeId(symbol: string, action: string): string {
  return `v41-${symbol}-${action}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isActiveStatus(status: V41TradeSession['status']): boolean {
  return status === 'Pending' || status === 'Running';
}

function isValidSession(value: unknown): value is V41TradeSession {
  if (value == null || typeof value !== 'object') return false;
  const s = value as V41TradeSession;
  return (
    typeof s.id === 'string' &&
    typeof s.symbol === 'string' &&
    (s.action === 'LONG' || s.action === 'SHORT') &&
    typeof s.status === 'string' &&
    typeof s.entry === 'number' &&
    typeof s.openedAt === 'number'
  );
}

function normalizeSessions(raw: unknown): V41TradeSession[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isValidSession);
}

async function persistSessions(sessions: V41TradeSession[]): Promise<void> {
  await persistSetJson(V41_SESSIONS_STORAGE_KEY, sessions);
}

function triggerV41SessionSync(): void {
  syncOnAction('V41_SESSION_UPDATED').catch((err) => {
    console.warn('[V41Session] Drive sync failed (non-critical):', err);
  });
}

function patchIsMeaningful(
  session: V41TradeSession,
  patch: V41SessionAdviserPatch,
): boolean {
  if (patch.status != null && patch.status !== session.status) return true;
  if (
    patch.advisorActionCode != null &&
    patch.advisorActionCode !== session.advisorActionCode
  ) {
    return true;
  }
  return false;
}

export const useV41TradeSessionStore = create<V41TradeSessionStore>((set, get) => ({
  sessions: [],
  hydrated: false,

  hasActiveSession: (symbol) =>
    get().sessions.some((s) => s.symbol === symbol && isActiveStatus(s.status)),

  hydrate: async () => {
    try {
      const saved = await persistGetJson<unknown>(V41_SESSIONS_STORAGE_KEY);
      const sessions = normalizeSessions(saved);
      set({ sessions, hydrated: true });
    } catch (err) {
      console.warn('[V41Session] hydrate failed:', err);
      set({ hydrated: true });
    }
  },

  mergeSessionsFromRemote: async (remote) => {
    const normalized = normalizeSessions(remote);
    const prev = get().sessions;
    const { merged, changes } = mergeByIdRemoteWins(prev, normalized);
    if (changes === 0) return 0;
    set({ sessions: merged });
    await persistSessions(merged);
    return changes;
  },

  replaceSessionsFromRemote: async (remote) => {
    return get().mergeSessionsFromRemote(remote);
  },

  createSession: (input) => {
    if (get().hasActiveSession(input.symbol)) {
      return null;
    }
    const now = Date.now();
    const advisorUpdatedAt = toAdvisorUpdatedAtUtc(now);
    const session: V41TradeSession = {
      id: makeId(input.symbol, input.action),
      symbol: input.symbol,
      displayName: symbolDisplayName(input.symbol),
      action: input.action,
      status: 'Pending',
      entry: input.entry,
      current: input.entry,
      pnl: null,
      advisor: 'Waiting Fill' satisfies V41TradeSessionAdvisor,
      advisorActionCode: 'WAITING_FILL',
      advisorReason: 'Chờ khớp lệnh',
      advisorReasonCode: 'WAITING_FILL',
      advisorUpdatedAt,
      advisorSequence: 1,
      advisorHistory: [
        {
          sequence: 1,
          advisorActionCode: 'WAITING_FILL',
          advisor: 'Waiting Fill',
          advisorReason: 'Chờ khớp lệnh',
          advisorReasonCode: 'WAITING_FILL',
          advisorUpdatedAt,
        },
      ],
      stop: input.stop,
      tp: input.tp,
      tp2: input.tp2,
      tp3: input.tp3,
      openedAt: now,
      triggerType: input.triggerType,
    };
    const sessions = [session, ...get().sessions];
    set({ sessions });
    void persistSessions(sessions);
    triggerV41SessionSync();
    return session;
  },

  updateSession: (id, patch) => {
    const sessions = get().sessions.map((s) => (s.id === id ? { ...s, ...patch } : s));
    set({ sessions });
    void persistSessions(sessions);
    const meaningful =
      patch.status != null ||
      patch.advisorActionCode != null ||
      patch.stop != null ||
      patch.tp != null;
    if (meaningful) triggerV41SessionSync();
  },

  applyAdviserPatches: (patches) => {
    if (patches.length === 0) return;
    const byId = new Map(patches.map((p) => [p.sessionId, p]));
    let meaningful = false;
    const sessions = get().sessions.map((session) => {
      const patch = byId.get(session.id);
      if (!patch) return session;
      if (patchIsMeaningful(session, patch)) meaningful = true;
      return {
        ...session,
        status: patch.status ?? session.status,
        current: patch.current ?? session.current,
        pnl: patch.pnl !== undefined ? patch.pnl : session.pnl,
        advisor: patch.advisor,
        advisorActionCode: patch.advisorActionCode,
        advisorReason: patch.advisorReason,
        advisorReasonCode: patch.advisorReasonCode,
        advisorUpdatedAt: patch.advisorUpdatedAt,
        advisorSequence: patch.advisorSequence,
        advisorHistory: patch.historyAppend
          ? [...session.advisorHistory, patch.historyAppend]
          : session.advisorHistory,
      };
    });
    set({ sessions });
    void persistSessions(sessions);
    if (meaningful) triggerV41SessionSync();
  },

  endSession: (id) => {
    const sessions = get().sessions.map((s) =>
      s.id === id
        ? {
            ...s,
            status: 'Closed' as const,
            advisor: s.advisor === 'Waiting Fill' ? ('Close' as const) : s.advisor,
          }
        : s,
    );
    set({ sessions });
    void persistSessions(sessions);
    triggerV41SessionSync();
  },

  clearAll: () => {
    set({ sessions: [] });
    void persistSessions([]);
    triggerV41SessionSync();
  },
}));

/** Register V41 get/apply into Drive sync bridge (merge — không ghi đè journal/positions). */
export function registerV41DriveSyncBridge(): void {
  mergeDriveSyncStoreBridge({
    getV41Sessions: () => useV41TradeSessionStore.getState().sessions,
    applyV41SessionsMirrorFromApk: async (remoteSessions, meta) => {
      const allow =
        Platform.OS === 'web' || meta?.restoreReason === 'empty_push_guard';
      if (!allow) return 0;
      if (
        meta?.restoreReason !== 'empty_push_guard' &&
        meta?.deviceId &&
        meta.deviceId !== 'APK'
      ) {
        return 0;
      }
      return useV41TradeSessionStore
        .getState()
        .mergeSessionsFromRemote(normalizeSessions(remoteSessions));
    },
  });
}

