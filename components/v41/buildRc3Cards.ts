/**

 * V4.1 RC3 — ViewModel builders only.

 *

 * CHỈ map shell ViewModel (symbol → card trống).

 * Không tính indicator, không gọi engine, không sinh signal.

 */



import {

  V41_RC3_SYMBOLS,

  symbolDisplayName,

  type V41ChecklistItem,

  type V41Rc3SignalCardModel,

  type V41TrGateSummaryUi,

} from './v41Rc3Types';



/** Shell labels — khớp 4 signal TR gate (không BTC Confirm). */

const DEFAULT_CHECKLIST_LABELS: Array<{ id: string; label: string }> = [

  { id: 'cvd_flip', label: 'CVD Flip' },

  { id: 'volume', label: 'Volume Confirm' },

  { id: 'structure', label: 'Structure Break' },

  { id: 'exhaustion', label: 'Exhaustion' },

];



/** Checklist shell — toàn bộ chưa đạt; không đọc dữ liệu thị trường. */

export function emptyChecklist(): V41ChecklistItem[] {

  return DEFAULT_CHECKLIST_LABELS.map((item) => ({

    ...item,

    passed: false,

  }));

}



/** Gate shell — ngưỡng hard-code khớp production constants (display only). */

export function emptyGate(): V41TrGateSummaryUi {

  return {

    signalsPassed: 0,

    signalsRequired: 3,

    signalsTotal: 4,

    confidenceTr: null,

    confidenceMin: 50,

    signalsMet: false,

    confidenceMet: false,

    activeEligible: false,

  };

}



/**

 * Card trống RC3.

 * `decision: 'WATCH'` / `confidence: null` / `levels: null` = shell UI,

 * không phải output engine.

 */

export function buildEmptyRc3Card(symbol: string): V41Rc3SignalCardModel {

  return {

    symbol,

    displayName: symbolDisplayName(symbol),

    triggerType: null,

    confidence: null,

    gate: emptyGate(),

    checklist: emptyChecklist(),

    levels: null,

    decision: 'WATCH',

    fetchedAt: null,

  };

}



/** Map danh sách symbol → ViewModel shell. */

export function buildRc3Cards(

  symbols: readonly string[] = V41_RC3_SYMBOLS,

): V41Rc3SignalCardModel[] {

  return symbols.map((symbol) => buildEmptyRc3Card(symbol));

}



/**

 * Map rows (chỉ lấy identity `symbol` nếu cần) → ViewModel shell.

 * Không đọc snapshot / indicator / opportunity.

 */

export function buildRc3CardsFromRows(

  _rows: Array<{ symbol: string }>,

  symbols: readonly string[] = V41_RC3_SYMBOLS,

): V41Rc3SignalCardModel[] {

  return buildRc3Cards(symbols);

}


