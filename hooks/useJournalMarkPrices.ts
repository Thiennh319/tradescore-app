import { useCallback, useEffect, useRef, useState } from 'react';

import type { SignalRow } from './useSignalBoard';

import type { SignalRowV41 } from '../services/v41/scanV41';

import { mergeMarkPrices } from './useJournalMarketSync';

import { subscribeScanMarkPricesUpdated } from './scanMarkPriceBus';



export function patchMarkPrices(

  prev: Record<string, number>,

  incoming: Record<string, number>,

): Record<string, number> {

  let changed = false;

  const next = { ...prev };

  for (const [symbol, price] of Object.entries(incoming)) {

    if (!Number.isFinite(price)) continue;

    if (next[symbol] !== price) {

      next[symbol] = price;

      changed = true;

    }

  }

  return changed ? next : prev;

}



/**

 * Live mark prices for journal Current/Exit — patched after each scan.

 * Uses refs so notify listeners always merge the latest scan rows (no stale closure).

 */

export function useJournalMarkPrices(

  signalRows: SignalRow[],

  v41Rows: SignalRowV41[] = [],

): Record<string, number> {

  const signalRowsRef = useRef(signalRows);

  const v41RowsRef = useRef(v41Rows);

  signalRowsRef.current = signalRows;

  v41RowsRef.current = v41Rows;



  const [markBySymbol, setMarkBySymbol] = useState<Record<string, number>>(() =>

    mergeMarkPrices(signalRows, v41Rows),

  );



  const applyScanMarks = useCallback(() => {

    const incoming = mergeMarkPrices(signalRowsRef.current, v41RowsRef.current);

    setMarkBySymbol((prev) => patchMarkPrices(prev, incoming));

  }, []);



  useEffect(() => {

    applyScanMarks();

  }, [signalRows, v41Rows, applyScanMarks]);



  useEffect(() => {

    return subscribeScanMarkPricesUpdated(applyScanMarks);

  }, [applyScanMarks]);



  return markBySymbol;

}


