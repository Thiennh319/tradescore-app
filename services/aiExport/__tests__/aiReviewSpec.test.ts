import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const DOCS_DIR = resolve(__dirname, '../../../docs');

function readDoc(name: string): string {
  return readFileSync(resolve(DOCS_DIR, name), 'utf8');
}

const SPEC = 'AI_REVIEW_SPEC.md';
const CHECKLIST = 'AI_REVIEW_CHECKLIST.md';
const EXAMPLE = 'AI_REVIEW_EXAMPLE.md';

const REVIEW_ORDER = [
  '01_RULEBOOK.md',
  '02_SCORE_ENGINE.md',
  '03_ENTRY_QUALITY.md',
  '04_POSITION_ADVISER.md',
  '05_TRADE_PLAN.md',
  '06_MARKET_SNAPSHOT.md',
  '07_SIGNAL_DECISION.md',
  '08_UL_ANALYTICS.md',
  '09_JOURNAL.md',
  '10_SUMMARY.md',
];

const REVIEW_LEVELS = [
  'PASS',
  'MINOR ISSUE',
  'WARNING',
  'FAIL',
  'OPTIMIZATION',
  'REVIEW REQUIRED',
];

const OUTPUT_SECTIONS = [
  '# Executive Summary',
  '# PASS',
  '# WARNING',
  '# FAIL',
  '# OPTIMIZATION',
  '# RECOMMENDED CHANGES',
  '# EVIDENCE',
  '# FINAL VERDICT',
];

describe('TASK 16.1 AI Review Specification', () => {
  it('Specification exists — all three docs are present and non-empty', () => {
    for (const name of [SPEC, CHECKLIST, EXAMPLE]) {
      const content = readDoc(name);
      expect(content.length, `${name} should not be empty`).toBeGreaterThan(0);
    }
  });

  it('Review Order — spec lists files in the exact mandatory order', () => {
    const spec = readDoc(SPEC);
    let lastIndex = -1;
    for (const file of REVIEW_ORDER) {
      const idx = spec.indexOf(file);
      expect(idx, `${file} missing from spec`).toBeGreaterThan(-1);
      expect(idx, `${file} out of order in spec`).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }
  });

  it('Review Order — index/README is read before rulebook', () => {
    const spec = readDoc(SPEC);
    const indexIdx = Math.min(
      ...['00_INDEX.md', 'README.md']
        .map((n) => spec.indexOf(n))
        .filter((i) => i > -1),
    );
    expect(indexIdx).toBeGreaterThan(-1);
    expect(indexIdx).toBeLessThan(spec.indexOf('01_RULEBOOK.md'));
  });

  it('Review Levels — all six levels are defined in the spec', () => {
    const spec = readDoc(SPEC);
    for (const level of REVIEW_LEVELS) {
      expect(spec, `spec missing level ${level}`).toContain(level);
    }
  });

  it('Review Pipeline — the five stages are defined', () => {
    const spec = readDoc(SPEC);
    for (const stage of ['Read', 'Analyze', 'Cross-check', 'Evaluate', 'Recommend']) {
      expect(spec).toContain(stage);
    }
  });

  it('Output Format — all mandatory report sections defined in order', () => {
    const spec = readDoc(SPEC);
    let lastIndex = -1;
    for (const section of OUTPUT_SECTIONS) {
      const idx = spec.indexOf(section);
      expect(idx, `spec missing section ${section}`).toBeGreaterThan(-1);
      expect(idx, `section ${section} out of order`).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }
  });

  it('AI Limitations — spec forbids changing rule/threshold/weight/state', () => {
    const spec = readDoc(SPEC).toLowerCase();
    for (const word of ['rule', 'threshold', 'weight', 'state']) {
      expect(spec).toContain(word);
    }
    expect(spec).toContain('propose');
  });

  it('Human Approval — full approval pipeline is documented', () => {
    const spec = readDoc(SPEC);
    for (const step of [
      'Developer Review',
      'Human Review',
      'Cursor Patch',
      'Re-test',
      'Merge',
    ]) {
      expect(spec).toContain(step);
    }
  });

  it('Checklist — every review category has a section', () => {
    const checklist = readDoc(CHECKLIST);
    for (const category of [
      'RuleBook Checklist',
      'Score Checklist',
      'Entry Checklist',
      'Position Adviser Checklist',
      'Trade Plan Checklist',
      'Market Snapshot Checklist',
      'Signal Checklist',
      'Analytics Checklist',
      'Journal Checklist',
      'Summary Checklist',
    ]) {
      expect(checklist, `checklist missing ${category}`).toContain(category);
    }
  });

  it('Checklist — RuleBook items are complete', () => {
    const checklist = readDoc(CHECKLIST);
    for (const item of [
      'Rule conflict',
      'Priority conflict',
      'Duplicate rule',
      'Missing rule',
      'Dead rule',
      'Hard Block',
      'Soft Block',
      'Unlock Rule',
      'Threshold',
      'State transition',
      'Weight',
      'Reason',
      'Evidence',
      'Decision',
    ]) {
      expect(checklist, `RuleBook checklist missing ${item}`).toContain(item);
    }
  });

  it('Checklist — Analytics says review only, no recalculation', () => {
    const checklist = readDoc(CHECKLIST).toLowerCase();
    expect(checklist).toContain('do not recalculate');
    for (const metric of [
      'win rate',
      'profit factor',
      'expectancy',
      'net pnl',
      'drawdown',
      'recovery',
      'consistency',
      'performance score',
    ]) {
      expect(checklist).toContain(metric);
    }
  });

  it('Example — follows the mandatory output format and ends with a valid verdict', () => {
    const example = readDoc(EXAMPLE);
    for (const section of OUTPUT_SECTIONS) {
      expect(example, `example missing ${section}`).toContain(section);
    }
    expect(example).toMatch(/# FINAL VERDICT[\s\S]*(PASS|REVIEW REQUIRED)/);
  });

  it('No Engine dependency — specs never import engine/UI/store modules', () => {
    for (const name of [SPEC, CHECKLIST, EXAMPLE]) {
      const content = readDoc(name);
      expect(content).not.toMatch(/import\s+.*from/);
      expect(content).not.toMatch(/require\(/);
    }
  });

  it('No UI import — specs do not reference engine/UI source paths', () => {
    for (const name of [SPEC, CHECKLIST, EXAMPLE]) {
      const content = readDoc(name);
      expect(content).not.toContain('components/');
      expect(content).not.toContain('store/');
      expect(content).not.toContain('.tsx');
    }
  });
});
