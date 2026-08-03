/**
 * V4.1 Export — shared document metadata.
 * Version always reads BUILD_INFO (product sync) — never a separate hardcode.
 */

import { BUILD_INFO } from '../../../constants/buildInfo';
import type { V41ExportScalar } from '../formatters/markdown';

export interface V41ExportMetaInput {
  generatedAt?: V41ExportScalar;
  tradeId?: V41ExportScalar;
  coin?: V41ExportScalar;
  side?: V41ExportScalar;
  /** Optional override; default = BUILD_INFO.version. */
  engineVersion?: V41ExportScalar;
  /** Optional document schema label for this export family. */
  version?: V41ExportScalar;
}

export interface V41ExportMeta {
  version: string;
  generatedAt: string;
  tradeId: string;
  coin: string;
  side: string;
  engineVersion: string;
  /** Always BUILD_INFO.version unless caller overrides engineVersion. */
  buildInfoVersion: string;
}

export const V41_EXPORT_DOC_VERSION = 'v41-export-1' as const;

/** Resolve metadata; copy-only — no engine calls. */
export function resolveV41ExportMeta(input?: V41ExportMetaInput | null): V41ExportMeta {
  const buildInfoVersion = BUILD_INFO.version;
  return {
    version:
      input?.version != null && String(input.version).trim() !== ''
        ? String(input.version)
        : V41_EXPORT_DOC_VERSION,
    generatedAt:
      input?.generatedAt != null && String(input.generatedAt).trim() !== ''
        ? String(input.generatedAt)
        : new Date().toISOString(),
    tradeId: input?.tradeId != null ? String(input.tradeId) : '',
    coin: input?.coin != null ? String(input.coin) : '',
    side: input?.side != null ? String(input.side) : '',
    engineVersion:
      input?.engineVersion != null && String(input.engineVersion).trim() !== ''
        ? String(input.engineVersion)
        : buildInfoVersion,
    buildInfoVersion,
  };
}
