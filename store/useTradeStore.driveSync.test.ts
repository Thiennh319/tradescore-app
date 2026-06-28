import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants/scoring';

const syncOnActionMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('../services/driveSyncService', () => ({
  syncOnAction: syncOnActionMock,
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../services/webFileBackup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/webFileBackup')>();
  return {
    ...actual,
    writeBackupFile: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../services/webIndexedDbMirror', () => ({
  saveSnapshotToIndexedDb: vi.fn().mockResolvedValue(undefined),
  loadSnapshotFromIndexedDb: vi.fn().mockResolvedValue(null),
}));

beforeEach(async () => {
  vi.clearAllMocks();
  syncOnActionMock.mockResolvedValue(undefined);
  vi.resetModules();

  const { useTradeStore } = await import('./useTradeStore');
  useTradeStore.setState({
    tradeJournal: [],
    aiTradeJournal: [],
    settings: DEFAULT_SETTINGS,
    analysisTimeframe: '1h',
  });
});

describe('useTradeStore journal Drive sync', () => {
  const sampleEntry = {
    symbol: 'BTCUSDT' as const,
    direction: 'LONG' as const,
    entryPrice: 65000,
    entryTime: Date.now(),
    leverage: 5,
    size: 10,
    stopLoss: 64000,
    takeProfit1: 66000,
  };

  it('addJournalEntry gọi syncOnAction với JOURNAL_ENTRY_ADDED', async () => {
    const { useTradeStore } = await import('./useTradeStore');

    const record = await useTradeStore.getState().addJournalEntry(sampleEntry);

    expect(record.id).toBeTruthy();
    expect(useTradeStore.getState().tradeJournal).toHaveLength(1);
    expect(syncOnActionMock).toHaveBeenCalledWith('JOURNAL_ENTRY_ADDED');
    expect(syncOnActionMock).toHaveBeenCalledWith('ORDER_PLACED');
  });

  it('syncOnAction fail không ảnh hưởng addJournalEntry', async () => {
    syncOnActionMock.mockRejectedValueOnce(new Error('Drive offline'));

    const { useTradeStore } = await import('./useTradeStore');

    await expect(
      useTradeStore.getState().addJournalEntry(sampleEntry),
    ).resolves.toMatchObject({
      symbol: 'BTCUSDT',
      status: 'OPEN',
    });

    expect(useTradeStore.getState().tradeJournal).toHaveLength(1);
    expect(syncOnActionMock).toHaveBeenCalledWith('JOURNAL_ENTRY_ADDED');
  });
});

describe('useTradeStore position Drive sync', () => {
  const sampleEntry = {
    symbol: 'BTCUSDT' as const,
    direction: 'LONG' as const,
    entryPrice: 65000,
    entryTime: Date.now(),
    leverage: 5,
    size: 10,
    stopLoss: 64000,
    takeProfit1: 66000,
  };

  it('openPosition gọi syncOnAction ORDER_PLACED', async () => {
    const { useTradeStore } = await import('./useTradeStore');

    await useTradeStore.getState().addJournalEntry(sampleEntry);

    expect(syncOnActionMock).toHaveBeenCalledWith('ORDER_PLACED');
  });

  it('closePosition gọi syncOnAction ORDER_CLOSED', async () => {
    const { useTradeStore } = await import('./useTradeStore');

    const record = await useTradeStore.getState().addJournalEntry(sampleEntry);
    syncOnActionMock.mockClear();

    await useTradeStore.getState().closeJournalEntry(record.id, {
      exitPrice: 66000,
      closeReason: 'MANUAL_STOP',
    });

    expect(syncOnActionMock).toHaveBeenCalledWith('ORDER_CLOSED');
  });

  it('syncOnAction fail không block closePosition', async () => {
    syncOnActionMock.mockRejectedValue(new Error('Drive offline'));

    const { useTradeStore } = await import('./useTradeStore');

    const record = await useTradeStore.getState().addJournalEntry(sampleEntry);

    await expect(
      useTradeStore.getState().closeJournalEntry(record.id, {
        exitPrice: 64000,
        closeReason: 'SL',
      }),
    ).resolves.toBeUndefined();

    const closed = useTradeStore.getState().tradeJournal.find((e) => e.id === record.id);
    expect(closed?.status).toBe('CLOSED');
  });

  it('allows multiple independent OPEN records for the same symbol', async () => {
    const { useTradeStore } = await import('./useTradeStore');

    const first = await useTradeStore.getState().addJournalEntry(sampleEntry);
    const second = await useTradeStore.getState().addJournalEntry({
      ...sampleEntry,
      entryPrice: 65100,
      entryTime: Date.now() + 1,
    });
    const third = await useTradeStore.getState().addJournalEntry({
      ...sampleEntry,
      entryPrice: 65200,
      entryTime: Date.now() + 2,
    });

    const openBtc = useTradeStore
      .getState()
      .tradeJournal.filter((e) => e.symbol === 'BTCUSDT' && e.status === 'OPEN');

    expect(openBtc).toHaveLength(3);
    expect(new Set(openBtc.map((e) => e.id))).toEqual(
      new Set([first.id, second.id, third.id]),
    );
  });

  it('persists strategySource on legacy and AI journal entries', async () => {
    const { useTradeStore } = await import('./useTradeStore');
    const { buildSnapshotsFromSignalRow } = await import('../services/journalService');

    await useTradeStore.getState().addJournalEntry({
      ...sampleEntry,
      strategySource: 'V3',
    });
    await useTradeStore.getState().addJournalEntry({
      ...sampleEntry,
      entryPrice: 65100,
      entryTime: Date.now() + 1,
      strategySource: 'V4',
    });
    await useTradeStore.getState().addJournalEntry({
      ...sampleEntry,
      entryPrice: 65200,
      entryTime: Date.now() + 2,
      strategySource: 'CVDX',
    });

    const legacySources = useTradeStore
      .getState()
      .tradeJournal.map((e) => e.strategySource);
    expect(legacySources).toEqual(['V3', 'V4', 'CVDX']);

    const row = {
      symbol: 'BTCUSDT' as const,
      direction: 'LONG' as const,
      score: 10,
      longScore: 10,
      shortScore: 5,
      decisionLabel: 'VAO_TU_TIN' as const,
      decisionDisplay: 'Vào tự tin',
      winrate: '55%',
      canEnter: true,
      layers: [],
      mandatoryViolations: [],
      hardBlocked: false,
      price: 65000,
      change24h: 1,
      trend: 'BULLISH' as const,
      cvdValue: 0,
      cvdTrend: 'FLAT' as const,
      fundingRate: 0,
      topLSRatio: 1,
    };
    const snapshots = buildSnapshotsFromSignalRow({
      row,
      entryPrice: 65000,
      sizeActual: 10,
      planSource: 'v4',
      scorerVersion: 'v4',
    });
    await useTradeStore.getState().addTradeEntry(
      row.symbol,
      snapshots.market,
      snapshots.scoring,
      snapshots.plan,
      [],
      snapshots.fundingAtEntry,
      snapshots.squeezeAtEntry,
      'MANUAL',
    );

    const aiEntry = useTradeStore.getState().aiTradeJournal.at(-1);
    expect(aiEntry?.strategySource).toBe('MANUAL');
  });
});

describe('useTradeStore capital Drive sync', () => {
  it('updateCapital gọi syncOnAction CAPITAL_UPDATED', async () => {
    const { useTradeStore } = await import('./useTradeStore');

    await useTradeStore.getState().updateCapital(40);

    expect(syncOnActionMock).toHaveBeenCalledWith('CAPITAL_UPDATED');
    expect(useTradeStore.getState().settings.accountSize).toBe(40);
  });

  it('syncOnAction fail không block updateCapital', async () => {
    syncOnActionMock.mockRejectedValueOnce(new Error('Drive offline'));

    const { useTradeStore } = await import('./useTradeStore');

    await expect(useTradeStore.getState().updateCapital(42)).resolves.toBeUndefined();

    expect(useTradeStore.getState().settings.accountSize).toBe(42);
    expect(syncOnActionMock).toHaveBeenCalledWith('CAPITAL_UPDATED');
  });
});
