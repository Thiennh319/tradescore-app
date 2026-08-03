/**
 * V4.1 Foundation — debug payload (DEV / tests / troubleshooting only).
 * Must not drive production UI directly.
 */

export interface V41EngineDebug {
  signals?: Record<string, boolean | number | string | null>;
  flags?: Record<string, boolean>;
  raw?: Record<string, unknown>;
  computedAt?: number;
}
