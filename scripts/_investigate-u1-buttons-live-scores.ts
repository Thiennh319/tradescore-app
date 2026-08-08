/**
 * Investigation-only: dry-run ambiguity + U1 for live-looking scores (no app edits).
 */
import {
  AMBIGUOUS_THRESHOLD,
  resolveDirectionAmbiguity,
} from '../services/directionAmbiguity';
import { isU1DirectionButtonEnabled } from '../components/dashboard/signalBoardU1';
import { nearShortL3HardBlockReason } from '../config/nearV4LayerGates';

const pairs = [
  { symbol: 'BTC', long: 5.6, short: 10.6 },
  { symbol: 'NEAR', long: 5.3, short: 9.7 },
  { symbol: 'SOL', long: 4.4, short: 10.3 },
  { symbol: 'BNB', long: 9.4, short: 7.5 },
] as const;

console.log('AMBIGUOUS_THRESHOLD', AMBIGUOUS_THRESHOLD);
console.log('--- Ambiguity (fresh previousState=null) ---');
for (const p of pairs) {
  const diff = Math.abs(p.long - p.short);
  const s0 = resolveDirectionAmbiguity(p.long, p.short, null);
  const s1 = resolveDirectionAmbiguity(p.long, p.short, s0);
  console.log(
    JSON.stringify({
      symbol: p.symbol,
      diff: Number(diff.toFixed(2)),
      currentlyAmbiguousRaw: diff < AMBIGUOUS_THRESHOLD,
      scan0: { status: s0.status, lean: s0.leaningDirection, ambCount: s0.consecutiveAmbiguousCount },
      scan1: { status: s1.status, lean: s1.leaningDirection, ambCount: s1.consecutiveAmbiguousCount },
    }),
  );
}

console.log('--- U1 if score>=9 only (no hard/group block) ---');
for (const p of pairs) {
  const official = p.long >= p.short ? 'LONG' : 'SHORT';
  let amb = resolveDirectionAmbiguity(p.long, p.short, null);
  amb = resolveDirectionAmbiguity(p.long, p.short, amb);
  const longBtn = isU1DirectionButtonEnabled({
    side: 'LONG',
    officialDirection: official,
    isAmbiguous: amb.status === 'AMBIGUOUS',
    directionReady: p.long >= 9,
  });
  const shortBtn = isU1DirectionButtonEnabled({
    side: 'SHORT',
    officialDirection: official,
    isAmbiguous: amb.status === 'AMBIGUOUS',
    directionReady: p.short >= 9,
  });
  console.log(JSON.stringify({ symbol: p.symbol, official, amb: amb.status, longBtn, shortBtn }));
}

console.log('--- U1 if hasAnyHardBlock forces directionReady=false (symptom C) ---');
for (const p of pairs) {
  const official = p.long >= p.short ? 'LONG' : 'SHORT';
  const longBtn = isU1DirectionButtonEnabled({
    side: 'LONG',
    officialDirection: official,
    isAmbiguous: false,
    directionReady: false,
  });
  const shortBtn = isU1DirectionButtonEnabled({
    side: 'SHORT',
    officialDirection: official,
    isAmbiguous: false,
    directionReady: false,
  });
  const badgeReady = (official === 'LONG' ? p.long : p.short) >= 9;
  console.log(
    JSON.stringify({
      symbol: p.symbol,
      badgeReady,
      longBtn,
      shortBtn,
      matchesSymptomC: badgeReady && !longBtn && !shortBtn,
    }),
  );
}

console.log('--- S1 NEAR-only ---');
for (const sym of ['BTCUSDT', 'NEARUSDT', 'SOLUSDT', 'BNBUSDT']) {
  console.log(sym, nearShortL3HardBlockReason(sym, 'SHORT', 1.0));
}
