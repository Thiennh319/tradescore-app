/**
 * Task V3V4-SYNC-3b — SMOKE baseline result (pre-guard behavior confirmed 2026-08-07).
 *
 * Pre-guard run (stdout): syncAll from empty local DID push journal/positions/capital/v41
 * and would overwrite a mock Gist that previously held data — khớp báo cáo V3V4-SYNC-3a.
 *
 * After Guard A: smoke dưới đây xác nhận chuỗi đã bị chặn (không còn wipe).
 * Lifecycle contract vẫn assert syncAll được gọi sau hydrate trên APK.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('../githubSync', () => ({
  uploadFile: vi.fn(),
  uploadFiles: vi.fn(),
  downloadFile: vi.fn(),
}));

vi.mock('../persistStorage', () => ({
  persistGetJson: vi.fn(async () => null),
  persistSetJson: vi.fn(async () => undefined),
  persistRemoveItem: vi.fn(async () => undefined),
}));

vi.mock('../signalBoardPersist', () => ({
  loadPersistedSignalBoard: vi.fn(async () => null),
  savePersistedSignalBoard: vi.fn(async () => undefined),
}));

import { uploadFiles, downloadFile } from '../githubSync';

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  const { clearDriveSyncStoreBridge } = await import('../driveSyncStoreBridge');
  clearDriveSyncStoreBridge();
});

afterEach(async () => {
  try {
    const mod = await import('../driveSyncService');
    mod.stopScheduler();
  } catch {
    // ignore
  }
});

describe('SMOKE V3V4-SYNC-3b — causal chain vs Guard A', () => {
  it('useDriveSyncLifecycle APK path calls syncAll after hydrate (code contract)', () => {
    const hookPath = path.join(__dirname, '../../hooks/useDriveSyncLifecycle.ts');
    const src = fs.readFileSync(hookPath, 'utf8');
    expect(src).toMatch(/Platform\.OS !== 'web'/);
    expect(src).toMatch(/void syncAll\(\)/);
    expect(src).toMatch(/after hydrate/);
  });

  it(
    'AFTER Guard A: empty local + Gist with data → Gist preserved (3a chain blocked)',
    async () => {
      const mockGist: Record<string, string> = {
        'tradescore_journal.json': JSON.stringify({
          version: '1.0.2',
          lastUpdated: '2026-08-07T09:00:00.000Z',
          deviceId: 'APK',
          data: [
            { id: 'aj_1', symbol: 'NEARUSDT' },
            { id: 'aj_2', symbol: 'BTCUSDT' },
          ],
        }),
      };

      let localJournal: unknown[] = [];
      vi.mocked(downloadFile).mockImplementation(async (name: string) => {
        const data = mockGist[name];
        if (!data) return { success: false, error: 'NOT_FOUND' };
        return { success: true, data };
      });
      vi.mocked(uploadFiles).mockImplementation(async (batch) => {
        for (const [name, content] of Object.entries(batch)) {
          mockGist[name] = content as string;
        }
        return { success: true, data: 'mock-gist' };
      });

      const { registerDriveSyncStoreBridge } = await import('../driveSyncStoreBridge');
      registerDriveSyncStoreBridge({
        getDeviceId: () => 'APK',
        getJournal: () => localJournal,
        getPositions: () => ({
          currentOpenTrade: null,
          openTrades: [],
          lockedPlan: null,
        }),
        getCapital: () => ({ milestoneJournal: [] }),
        applyJournalMirrorFromApk: async (remote) => {
          localJournal = [...(remote as unknown[])];
          return remote.length;
        },
        applyPositionsMirrorFromApk: async () => 0,
        applyCapitalMirrorFromApk: async () => false,
        getV41Sessions: () => [],
        applyV41SessionsMirrorFromApk: async () => 0,
      });

      const { syncAll } = await import('../driveSyncService');
      await syncAll();

      expect(JSON.parse(mockGist['tradescore_journal.json']).data).toHaveLength(2);
      expect(localJournal).toHaveLength(2);
    },
    15_000,
  );
});
