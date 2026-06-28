import type { TradeFullSnapshot } from './tradeSnapshot';
import { isWebPlatform } from '../utils/isWebPlatform';

const CHANNEL_NAME = 'tradescore-data-sync-v1';

type SyncMessage = { type: 'snapshot'; snapshot: TradeFullSnapshot; tabId: string };

let channel: BroadcastChannel | null = null;
let tabId = '';

function isWeb(): boolean {
  return isWebPlatform() && typeof BroadcastChannel !== 'undefined';
}

function getTabId(): string {
  if (!tabId) {
    tabId = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
  return tabId;
}

function getChannel(): BroadcastChannel | null {
  if (!isWeb()) return null;
  if (!channel) channel = new BroadcastChannel(CHANNEL_NAME);
  return channel;
}

/** Thông báo tab khác trên cùng port có snapshot mới. */
export function publishSnapshotUpdate(snapshot: TradeFullSnapshot): void {
  const ch = getChannel();
  if (!ch) return;
  try {
    const msg: SyncMessage = { type: 'snapshot', snapshot, tabId: getTabId() };
    ch.postMessage(msg);
  } catch {
    // ignore
  }
}

/** Lắng nghe cập nhật từ tab khác (cùng port). */
export function subscribeSnapshotUpdates(
  onUpdate: (snapshot: TradeFullSnapshot) => void,
): () => void {
  const ch = getChannel();
  if (!ch) return () => {};

  const handler = (event: MessageEvent<SyncMessage>) => {
    const data = event.data;
    if (data?.type !== 'snapshot' || data.tabId === getTabId()) return;
    onUpdate(data.snapshot);
  };

  ch.addEventListener('message', handler);
  return () => ch.removeEventListener('message', handler);
}
