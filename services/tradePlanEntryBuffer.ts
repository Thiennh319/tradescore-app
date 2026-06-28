export type EntryBufferSource = 'MIN_FLOOR' | 'ATR_BASED' | 'ATR_CAPPED';

export interface EntryBufferResult {
  entryBufferUsed: number;
  entryBufferSource: EntryBufferSource;
  /** % buffer so với giá tham chiếu (current price) */
  entryBufferPct: number;
}

/** Entry buffer: floor 0.30%, ATR×0.25, cap 0.50% of price. */
export function computeEntryBuffer(price: number, atr1h: number): EntryBufferResult {
  const minBuffer = price * 0.003;
  const atrBuffer = atr1h * 0.25;
  const maxBuffer = price * 0.005;

  let entryBufferSource: EntryBufferSource;
  if (atrBuffer > maxBuffer) {
    entryBufferSource = 'ATR_CAPPED';
  } else if (atrBuffer < minBuffer) {
    entryBufferSource = 'MIN_FLOOR';
  } else {
    entryBufferSource = 'ATR_BASED';
  }

  const entryBufferUsed = Math.max(minBuffer, Math.min(atrBuffer, maxBuffer));
  const entryBufferPct = (entryBufferUsed / price) * 100;
  return { entryBufferUsed, entryBufferSource, entryBufferPct };
}

export function srEntryFromLevel(
  direction: 'LONG' | 'SHORT',
  levelPrice: number,
  referencePrice: number,
  atr1h: number,
): { entry: number } & EntryBufferResult {
  const { entryBufferUsed, entryBufferSource, entryBufferPct } = computeEntryBuffer(
    referencePrice,
    atr1h,
  );
  const entry =
    direction === 'LONG'
      ? levelPrice * (1 + entryBufferUsed / referencePrice)
      : levelPrice * (1 - entryBufferUsed / referencePrice);
  return { entry, entryBufferUsed, entryBufferSource, entryBufferPct };
}

export function formatEntryBufferLabel(
  entryBufferPct: number,
  source: EntryBufferSource,
): string {
  const sourceLabel =
    source === 'MIN_FLOOR' ? 'floor' : source === 'ATR_CAPPED' ? 'ATR capped' : 'ATR-based';
  return `Buffer: ${entryBufferPct.toFixed(2)}% (${sourceLabel})`;
}
