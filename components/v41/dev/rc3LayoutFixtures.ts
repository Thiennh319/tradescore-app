/**

 * V4.1 RC3 — DEV-ONLY layout fixtures.

 *

 * ⚠️ PRODUCTION MUST NOT import this module (static or barrel).

 * Load only behind `if (__DEV__) { require(...) }`.

 *

 * @see docs/TASK9_5_ARCHITECTURE_REPORT.md

 */



import type { V41Rc3SignalCardModel } from '../v41Rc3Types';



function gateFromChecklist(

  checklist: V41Rc3SignalCardModel['checklist'],

  confidenceTr: number,

  confidenceMin = 50,

  signalsRequired = 3,

): V41Rc3SignalCardModel['gate'] {

  const signalsPassed = checklist.filter((c) => c.passed).length;

  const signalsMet = signalsPassed >= signalsRequired;

  const confidenceMet = confidenceTr >= confidenceMin;

  return {

    signalsPassed,

    signalsRequired,

    signalsTotal: checklist.length,

    confidenceTr,

    confidenceMin,

    signalsMet,

    confidenceMet,

    activeEligible: signalsMet && confidenceMet,

  };

}



export const RC3_LAYOUT_FIXTURES: V41Rc3SignalCardModel[] = [

  {

    symbol: 'BTCUSDT',

    displayName: 'BTC',

    triggerType: 'Trend Reversal',

    confidence: 82,

    checklist: [

      { id: 'cvd_flip', label: 'CVD Flip', passed: true },

      { id: 'volume', label: 'Volume Confirm', passed: true },

      { id: 'structure', label: 'Structure Break', passed: true },

      { id: 'exhaustion', label: 'Exhaustion', passed: true },

    ],

    gate: gateFromChecklist(

      [

        { id: 'cvd_flip', label: 'CVD Flip', passed: true },

        { id: 'volume', label: 'Volume Confirm', passed: true },

        { id: 'structure', label: 'Structure Break', passed: true },

        { id: 'exhaustion', label: 'Exhaustion', passed: true },

      ],

      82,

    ),

    levels: {

      entry: 65000,

      stop: 64220,

      tp1: 65780,

      tp2: 66560,

      tp3: 67340,

      rr: 1.0,

    },

    decision: 'LONG',

  },

  {

    symbol: 'SOLUSDT',

    displayName: 'SOL',

    triggerType: 'Volatility Explosion',

    confidence: 71,

    checklist: [

      { id: 'cvd_flip', label: 'CVD Flip', passed: true },

      { id: 'volume', label: 'Volume Confirm', passed: false },

      { id: 'structure', label: 'Structure Break', passed: false },

      { id: 'exhaustion', label: 'Exhaustion', passed: true },

    ],

    gate: gateFromChecklist(

      [

        { id: 'cvd_flip', label: 'CVD Flip', passed: true },

        { id: 'volume', label: 'Volume Confirm', passed: false },

        { id: 'structure', label: 'Structure Break', passed: false },

        { id: 'exhaustion', label: 'Exhaustion', passed: true },

      ],

      55,

    ),

    levels: null,

    decision: 'WATCH',

  },

  {

    symbol: 'BNBUSDT',

    displayName: 'BNB',

    triggerType: 'Fake Breakout',

    confidence: 78,

    checklist: [

      { id: 'cvd_flip', label: 'CVD Flip', passed: true },

      { id: 'volume', label: 'Volume Confirm', passed: true },

      { id: 'structure', label: 'Structure Break', passed: true },

      { id: 'exhaustion', label: 'Exhaustion', passed: true },

    ],

    gate: gateFromChecklist(

      [

        { id: 'cvd_flip', label: 'CVD Flip', passed: true },

        { id: 'volume', label: 'Volume Confirm', passed: true },

        { id: 'structure', label: 'Structure Break', passed: true },

        { id: 'exhaustion', label: 'Exhaustion', passed: true },

      ],

      78,

    ),

    levels: {

      entry: 580,

      stop: 591,

      tp1: 569,

      tp2: 558,

      tp3: 547,

      rr: 1.0,

    },

    decision: 'SHORT',

  },

  {

    symbol: 'NEARUSDT',

    displayName: 'NEAR',

    triggerType: 'Trend Reversal',

    confidence: 44,

    checklist: [

      { id: 'cvd_flip', label: 'CVD Flip', passed: false },

      { id: 'volume', label: 'Volume Confirm', passed: false },

      { id: 'structure', label: 'Structure Break', passed: false },

      { id: 'exhaustion', label: 'Exhaustion', passed: false },

    ],

    gate: gateFromChecklist(

      [

        { id: 'cvd_flip', label: 'CVD Flip', passed: false },

        { id: 'volume', label: 'Volume Confirm', passed: false },

        { id: 'structure', label: 'Structure Break', passed: false },

        { id: 'exhaustion', label: 'Exhaustion', passed: false },

      ],

      44,

    ),

    levels: null,

    decision: 'IGNORE',

  },

];


