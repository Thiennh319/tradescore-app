/** Phát hiện môi trường web mà không import react-native (tránh lỗi vitest). */
export function isWebPlatform(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}
