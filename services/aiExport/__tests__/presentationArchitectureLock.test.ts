/**
 * TASK 17.5.3.7 — Presentation Architecture Lock.
 *
 * Static guards prevent Rule/Score Trace formatters and shared renderers from
 * bypassing the frozen Builder → Mapper → DTO → Renderer → Formatter pipeline.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');

function readSource(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

const FORMATTERS = [
  'services/aiExport/ruleTrace/RuleTraceFormatter.ts',
  'services/aiExport/scoreTrace/ScoreTraceFormatter.ts',
] as const;

const SHARED_RENDERERS = [
  'services/aiExport/shared/renderTraceLayer.ts',
  'services/aiExport/shared/renderTraceTable.ts',
  'services/aiExport/shared/renderTraceSection.ts',
] as const;

describe('TASK 17.5.3.7 — Presentation Architecture Lock', () => {
  it('formatters contain orchestration only', () => {
    for (const path of FORMATTERS) {
      const source = withoutComments(readSource(path));

      expect(source).toMatch(/renderTrace/);
      expect(source).not.toMatch(/from ['"].*formatters\/markdown['"]/);
      expect(source).not.toMatch(/from ['"].*traceLayerPresentation['"]/);
      expect(source).not.toMatch(/from ['"].*(Builder|Snapshot|Engine)/);
      expect(source).not.toMatch(/\b(?:fmt|kv|table|bullets)\s*\(/);
      expect(source).not.toMatch(/\bnormalizeTraceRecommendation\s*\(/);
      expect(source).not.toMatch(/\bformatTraceDependsLine\s*\(/);
      expect(source).not.toContain('--------------------------------');
      expect(source).not.toMatch(/['"`]#\s/);
      expect(source).not.toMatch(/['"`]\|\s*---/);
    }
  });

  it('formatters use section renderer, not layer/table renderers directly', () => {
    for (const path of FORMATTERS) {
      const source = withoutComments(readSource(path));

      expect(source).toMatch(/from ['"]\.\.\/shared\/renderTraceSection['"]/);
      expect(source).not.toMatch(/from ['"]\.\.\/shared\/renderTraceLayer['"]/);
      expect(source).not.toMatch(/from ['"]\.\.\/shared\/renderTraceTable['"]/);
    }
  });

  it('shared renderers read presentation DTOs only', () => {
    for (const path of SHARED_RENDERERS) {
      const source = withoutComments(readSource(path));

      expect(source).not.toMatch(/from ['"].*(Builder|Snapshot|Engine)/);
      expect(source).not.toMatch(/\bbuildRuleTrace\b|\bbuildScoreTrace\b/);
      expect(source).not.toMatch(
        /\bnormalizeTraceRecommendation\b|\blayerTraceStatus\b|\blayerTraceRecommendation\b|\blayerTraceDependency\b|\bformatTraceDependsLine\b/,
      );
    }
  });

  it('shared section renderer composes shared layer and table renderers', () => {
    const source = withoutComments(
      readSource('services/aiExport/shared/renderTraceSection.ts'),
    );

    expect(source).toMatch(/from ['"]\.\/renderTraceLayer['"]/);
    expect(source).toMatch(/from ['"]\.\/renderTraceTable['"]/);
    expect(source).toMatch(/\brenderTraceLayer\s*\(/);
    expect(source).toMatch(/\brenderTraceTable\s*\(/);
  });

  it('public export paths enforce Builder → Mapper → Formatter', () => {
    const ruleExport = withoutComments(
      readSource('services/aiExport/ruleTrace/RuleTraceExport.ts'),
    );
    const scoreExport = withoutComments(
      readSource('services/aiExport/scoreTrace/ScoreTraceExport.ts'),
    );

    expect(ruleExport).toMatch(
      /formatRuleTrace\s*\(\s*toRuleTracePresentation\s*\(\s*buildRuleTrace\s*\(\s*input\s*\)\s*\)\s*\)/,
    );
    expect(scoreExport).toMatch(
      /formatScoreTrace\s*\(\s*toScoreTracePresentation\s*\(\s*buildScoreTrace\s*\(\s*input\s*\)\s*\)\s*\)/,
    );
  });
});
