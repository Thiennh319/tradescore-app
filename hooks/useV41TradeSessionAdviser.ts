/**
 * Task 11 — áp Position Adviser lên Trade Session khi Market Snapshot (scan) cập nhật.
 * Không polling mới · không gọi Binance · UI không gọi engine.
 */

import { useEffect, useRef } from 'react';
import { buildTradeSessionAdviserPatches } from '../services/v41/rc3/buildTradeSessionAdviser';
import type { SignalRowV41 } from '../services/v41/scanV41';
import { useV41TradeSessionStore } from '../store/useV41TradeSessionStore';

/**
 * Chạy adviser sau mỗi lần scan rows đổi (cùng chu kỳ scan hiện có).
 */
export function useV41TradeSessionAdviser(rows: SignalRowV41[], loading = false) {
  const sessions = useV41TradeSessionStore((s) => s.sessions);
  const applyAdviserPatches = useV41TradeSessionStore((s) => s.applyAdviserPatches);
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  useEffect(() => {
    if (loading) return;
    if (rows.length === 0) return;
    const active = sessionsRef.current.filter(
      (s) => s.status === 'Pending' || s.status === 'Running',
    );
    if (active.length === 0) return;

    const patches = buildTradeSessionAdviserPatches(active, rows);
    applyAdviserPatches(patches);
  }, [rows, loading, applyAdviserPatches]);
}
