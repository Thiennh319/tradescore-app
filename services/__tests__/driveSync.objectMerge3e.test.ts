import { describe, expect, it } from 'vitest';
import {
  isCapitalPayloadDefaultEmpty,
  mergePositionsFieldsRemote,
} from '../driveSyncPayloadGuards';
import fs from 'node:fs';
import path from 'node:path';

describe('V3V4-SYNC-3e payload guards / object merge', () => {
  it('positions field-wise: remote null keeps local open/locked', () => {
    const localOpen = { id: 'open-1' };
    const localLocked = { symbol: 'BTCUSDT' };
    const r = mergePositionsFieldsRemote(localOpen, localLocked, {
      currentOpenTrade: null,
      openTrades: [],
      lockedPlan: null,
    });
    expect(r.nextOpen).toEqual(localOpen);
    expect(r.nextLocked).toEqual(localLocked);
    expect(r.protectedOpen).toBe(true);
    expect(r.protectedLocked).toBe(true);
  });

  it('positions field-wise: remote open replaces local', () => {
    const r = mergePositionsFieldsRemote(
      { id: 'old' },
      null,
      { currentOpenTrade: { id: 'new' }, openTrades: [{ id: 'new' }], lockedPlan: null },
    );
    expect(r.nextOpen).toEqual({ id: 'new' });
    expect(r.protectedOpen).toBe(false);
  });

  it('capital: local meaningful + remote default → would block (helper)', () => {
    const local = {
      currentCapital: 100,
      initialCapital: 34,
      lastMilestoneCapital: 34,
      milestoneJournal: [],
    };
    const remote = {
      currentCapital: 34,
      initialCapital: 34,
      lastMilestoneCapital: 34,
      milestoneJournal: [],
    };
    expect(isCapitalPayloadDefaultEmpty(local)).toBe(false);
    expect(isCapitalPayloadDefaultEmpty(remote)).toBe(true);
  });

  it('useTradeStore wires positions field merge + capital default guard', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../store/useTradeStore.ts'), 'utf8');
    expect(src).toMatch(/mergePositionsFieldsRemote/);
    expect(src).toMatch(/isCapitalPayloadDefaultEmpty\(localPayload\)/);
    expect(src).toMatch(/isCapitalPayloadDefaultEmpty\(remoteState\)/);
  });

  it('signalBoard still uses scannedAt + empty-rows skip (no 3e change required)', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../githubSyncService.ts'),
      'utf8',
    );
    expect(src).toMatch(/!remoteBoard\?\.rows\?\.length \|\| !remoteBoard\.scannedAt/);
    expect(src).toMatch(/localBoard\.scannedAt >= remoteBoard\.scannedAt/);
  });
});
