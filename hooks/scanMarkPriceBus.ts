/** Lightweight bus — notifies journal mark-price consumers after each scan wave. */

type ScanMarkListener = () => void;

const listeners = new Set<ScanMarkListener>();
let scanMarkGeneration = 0;

export function getScanMarkGeneration(): number {
  return scanMarkGeneration;
}

export function notifyScanMarkPricesUpdated(): void {
  scanMarkGeneration += 1;
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeScanMarkPricesUpdated(listener: ScanMarkListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
