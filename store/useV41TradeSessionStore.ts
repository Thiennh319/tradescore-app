/**
 * V4.1 RC3 — Trade Session store (UI only).
 * Không ghi Journal. Không gọi API. Không đụng V3/V4 trade store.
 */

import { create } from 'zustand';
import type {
  V41TradeSession,
  V41TradeSessionAdvisor,
  V41TriggerType,
} from '../components/v41/v41Rc3Types';
import { symbolDisplayName } from '../components/v41/v41Rc3Types';
import { toAdvisorUpdatedAtUtc } from '../services/v41/rc3/adviserMetadata';
import type { V41SessionAdviserPatch } from '../services/v41/rc3/tradeSessionAdviserTypes';

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
  /** Kết thúc lệnh → xoá khỏi Execution Monitor (Journal = task khác). */
  endSession: (id: string) => void;
  clearAll: () => void;
  /** True nếu coin đang Pending / Running. */
  hasActiveSession: (symbol: string) => boolean;
};

function makeId(symbol: string, action: string): string {
  return `v41-${symbol}-${action}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isActiveStatus(status: V41TradeSession['status']): boolean {
  return status === 'Pending' || status === 'Running';
}

export const useV41TradeSessionStore = create<V41TradeSessionStore>((set, get) => ({
  sessions: [],

  hasActiveSession: (symbol) =>
    get().sessions.some((s) => s.symbol === symbol && isActiveStatus(s.status)),

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
    set({ sessions: [session, ...get().sessions] });
    return session;
  },

  updateSession: (id, patch) => {
    set({
      sessions: get().sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  },

  applyAdviserPatches: (patches) => {
    if (patches.length === 0) return;
    const byId = new Map(patches.map((p) => [p.sessionId, p]));
    set({
      sessions: get().sessions.map((session) => {
        const patch = byId.get(session.id);
        if (!patch) return session;
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
      }),
    });
  },

  endSession: (id) => {
    set({ sessions: get().sessions.filter((s) => s.id !== id) });
  },

  clearAll: () => set({ sessions: [] }),
}));
