/**
 * TradeScore Audit Package Baseline — GĐ2 Freeze V1.0 (single source).
 */

export const AUDIT_PACKAGE_VERSION = '1.0';
export const AUDIT_PACKAGE_BASELINE_STATUS = 'FROZEN';
export const AUDIT_PACKAGE_TRADE_SCORE_VERSION = 'TradeScore V4';
export const AUDIT_PACKAGE_SNAPSHOT_VERSION = '1.0.0';

export function formatTradeScoreAuditPackageBaseline(generatedTime: string): string {
  const titleBorder = '='.repeat(58);
  const subBorder = '-'.repeat(58);

  return [
    titleBorder,
    'AUDIT PACKAGE BASELINE',
    titleBorder,
    '',
    'Audit Package Version',
    '',
    AUDIT_PACKAGE_VERSION,
    '',
    'Status',
    '',
    AUDIT_PACKAGE_BASELINE_STATUS,
    '',
    'TradeScore Version',
    '',
    AUDIT_PACKAGE_TRADE_SCORE_VERSION,
    '',
    'Snapshot Version',
    '',
    AUDIT_PACKAGE_SNAPSHOT_VERSION,
    '',
    'Generated',
    '',
    generatedTime,
    '',
    subBorder,
    '',
    'CONTENT',
    '',
    '✓ Executive Summary',
    '✓ Rule Book',
    '✓ Decision Trace',
    '✓ Market Evidence',
    '✓ Actual Result',
    '✓ AI Audit Instruction',
    '',
    subBorder,
    '',
    'CONTRACT',
    '',
    'Rule Book',
    'LOCKED',
    '',
    'Decision Trace',
    'LOCKED',
    '',
    'Audit Layout',
    'LOCKED',
    '',
    'Snapshot Contract',
    'LOCKED',
    '',
    titleBorder,
  ].join('\n');
}
