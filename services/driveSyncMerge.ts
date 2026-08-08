/**
 * V3V4-SYNC-3d — Web (và APK empty-push restore) merge helpers.
 * APK remote wins on same id; local-only entries are kept (no hard delete from remote omit).
 */

export function mergeByIdRemoteWins<T extends { id: string }>(
  local: T[],
  remote: T[],
): { merged: T[]; changes: number } {
  const localById = new Map(local.map((entry) => [entry.id, entry]));
  const remoteById = new Map(remote.map((entry) => [entry.id, entry]));
  let changes = 0;
  const merged: T[] = [];

  for (const loc of local) {
    const rem = remoteById.get(loc.id);
    if (!rem) {
      merged.push(loc);
      continue;
    }
    if (JSON.stringify(loc) !== JSON.stringify(rem)) {
      changes++;
    }
    merged.push(rem);
  }

  for (const rem of remote) {
    if (localById.has(rem.id)) continue;
    merged.push(rem);
    changes++;
  }

  return { merged, changes };
}
