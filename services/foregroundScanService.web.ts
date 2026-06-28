export async function startForegroundScanService(): Promise<void> {
  // Web dùng setInterval trong hooks — không có foreground service.
}

export async function stopForegroundScanService(): Promise<void> {}

export function isForegroundScanServiceRunning(): boolean {
  return false;
}
