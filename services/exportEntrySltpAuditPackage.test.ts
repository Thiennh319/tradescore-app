import { describe, expect, it } from 'vitest';
import { buildRuleAuditSnapshot } from './ruleAuditSnapshotBuilder';
import type { SignalRow } from './signalBoardScan';
import {
  ENTRY_SLTP_AUDIT_PACKAGE_FILENAME,
  ENTRY_SLTP_AUDIT_SECTION_HEADERS,
  ENTRY_SLTP_WORKSHEET_BLANK,
  exportEntrySltpAuditPackage,
} from './exportEntrySltpAuditPackage';
import type { TradePlanV3 } from '../constants/scoring';

function probeRow(): SignalRow {
  return {
    symbol: 'BTCUSDT',
    price: 65000,
    change24h: 1.2,
    trend: 'BULLISH',
    regimeConfidence: 0.8,
    score: 10,
    longScore: 10,
    shortScore: 8,
    direction: 'LONG',
    decisionLabel: 'CO_THE_VAO',
    decisionDisplay: 'CÓ THỂ VÀO',
    winrate: '50%',
    canEnter: true,
    tradePlan: null,
    layers: [],
    mandatoryViolations: [],
    hardBlocked: false,
    fromCache: false,
    ruleAuditSnapshot: buildRuleAuditSnapshot(),
    tradePlanV3: {
      symbol: 'BTCUSDT',
      direction: 'LONG',
      recommendedEntry: 65000,
      entryZone: { quality: 'GOOD' },
      stopLoss: { price: 64000, quality: 'NORMAL', atrDistance: 2 },
      tp1: { price: 67000, rrRatio: 2 },
      tp2: { price: 68000, rrRatio: 3 },
      tp3: { price: 69500, rrRatio: 4.5 },
      primaryRR: 2,
      expiryTier: 'MEDIUM',
      decision: 'CO_THE_VAO',
    } as TradePlanV3,
    tradePlansByScorer: {
      v4: {
        symbol: 'BTCUSDT',
        direction: 'LONG',
        recommendedEntry: 65000,
        entryZone: { quality: 'GOOD' },
        stopLoss: { price: 64000, quality: 'NORMAL', atrDistance: 2 },
        tp1: { price: 67000, rrRatio: 2 },
        tp2: { price: 68000, rrRatio: 3 },
        tp3: { price: 69500, rrRatio: 4.5 },
        primaryRR: 2,
        expiryTier: 'MEDIUM',
        decision: 'CO_THE_VAO',
      } as TradePlanV3,
    },
    adxGate: {
      allowed: true,
      block: false,
      severity: 'OK',
      regime: 'TRENDING',
      tpMultiplier: 1,
      slMultiplier: 1,
      message: 'OK',
    },
    structureSL: {
      slSource: 'STRUCTURE',
      slPrice: 64000,
      swingPrice: 63800,
      swingTime: Date.now(),
      bufferPct: 0.3,
      candlesBack: 5,
      distanceFromEntry: 1.5,
    },
    vwapSignal: {
      quality: 'GOOD',
      suggestedEntry: 64950,
      entryReason: 'Pullback to VWAP',
    },
  };
}

function sliceSection(output: string, sectionNum: number): string {
  const start = output.indexOf(`SECTION ${sectionNum}`);
  const end = output.indexOf(`SECTION ${sectionNum + 1}`);
  if (start === -1) return '';
  return end === -1 ? output.slice(start) : output.slice(start, end);
}

describe('exportEntrySltpAuditPackage', () => {
  it('does not throw and produces non-empty output', () => {
    const output = exportEntrySltpAuditPackage([probeRow()]);
    expect(output.length).toBeGreaterThan(500);
    expect(output).toContain('ENTRY / SL / TP AUDIT PACKAGE');
  });

  it('contains all 11 section headers', () => {
    const output = exportEntrySltpAuditPackage([probeRow()]);
    for (const header of ENTRY_SLTP_AUDIT_SECTION_HEADERS) {
      expect(output).toContain(header);
    }
    expect(output).toContain('SECTION 8');
    expect(output).toContain('EXPECTED CALCULATION');
    expect(output).not.toContain('SECTION 8\nRULE DECISION');
  });

  it('section 1 contains both mandatory notes', () => {
    const output = exportEntrySltpAuditPackage([probeRow()]);
    const section1End = output.indexOf('SECTION 2');
    const section1 = output.slice(0, section1End);
    expect(section1).toContain('entryZone.quality');
    expect(section1).toContain('vwap.entryQuality');
    expect(section1).toContain('DEAD PATH');
    expect(section1).toContain('TP1=2.0× TP2=3.0×');
    expect(section1).toContain('TP3=4.5×');
  });

  it('exports expected filename constant', () => {
    expect(ENTRY_SLTP_AUDIT_PACKAGE_FILENAME).toBe('Entry_SLTP_Audit_Package.txt');
  });

  it('section 8 is empty worksheet without pipeline values', () => {
    const row = probeRow();
    const output = exportEntrySltpAuditPackage([row]);
    const section8 = sliceSection(output, 8);

    expect(section8).toContain('EXPECTED CALCULATION WORKSHEET');
    expect(section8).toContain(ENTRY_SLTP_WORKSHEET_BLANK);
    expect(section8).toContain('Bước (a) Base Plan:');
    expect(section8).toContain('Bước (e) RR Check:');
    expect(section8).not.toContain('primaryRR (actual app)');
    expect(section8).not.toContain('gateSeverity');
    expect(section8).not.toContain(String(row.price));
    expect(section8).not.toContain(String(row.tradePlansByScorer?.v4?.recommendedEntry));
    expect(section8).not.toContain(String(row.structureSL?.slPrice));
  });

  it('section 9 and 10 contain actual pipeline values', () => {
    const row = probeRow();
    const output = exportEntrySltpAuditPackage([row]);
    const section9 = sliceSection(output, 9);
    const section10 = sliceSection(output, 10);

    expect(section9).toContain('65000');
    expect(section9).toContain('64000');
    expect(section9).toContain('GOOD');
    expect(section9).toContain('STRUCTURE');

    expect(section10).toContain('KẾ HOẠCH:');
    expect(section10).toContain('65000');
    expect(section10).toContain('64000');
  });

  it('section 10 excludes L1-L11 scoring blocks', () => {
    const output = exportEntrySltpAuditPackage([probeRow()]);
    const section10Start = output.indexOf('SECTION 10');
    const section10 = output.slice(section10Start);
    expect(section10).toContain('KẾ HOẠCH:');
    expect(section10).toContain('STRUCTURE SL:');
    expect(section10).not.toContain('10 LỚP CHẤM ĐIỂM');
    expect(section10).not.toContain('L11 Squeeze');
    expect(section10).not.toContain('NHÓM ĐIỂM');
  });

  it('writes sample output when SAMPLE=1', () => {
    if (process.env.SAMPLE !== '1') return;
    const fs = require('node:fs') as typeof import('node:fs');
    const path = require('node:path') as typeof import('node:path');
    const outPath = path.join(
      process.cwd(),
      'docs',
      'Entry_SLTP_Audit_Package_Sample_Output.txt',
    );
    fs.writeFileSync(outPath, exportEntrySltpAuditPackage([probeRow()]), 'utf8');
    expect(fs.existsSync(outPath)).toBe(true);
  });
});
