# REPORT — Board 8-coin V4 trusted window (Task 5 verify)

**Ngày:** 2026-08-09  
**Chạy lúc:** 2026-08-09T13:40:52.355Z  
**TRADE_SYMBOLS:** `BTCUSDT, NEARUSDT, SOLUSDT, BNBUSDT, XRPUSDT, ETHUSDT, LINKUSDT, AVAXUSDT`  
**CVD:** `TRADESCORE_FORCE_ABSOLUTE_CVD=1` (so sánh với baseline7; production XRP vẫn Option A khi app chạy)  
**Cửa sổ:** `--days 21` · `--out-tag board8` · `--v4-only`  
**Script:** `scripts/backtest-v4-board-8coin-trusted.ts`

## Bảng V4

| Coin | n | WR | PF | E[R] | %Long | Verdict |
|------|--:|---:|---:|------:|------:|---------|
| BTC | 34 | 50.0% | 2.41 | 0.236 | 53% | INVESTIGATE |
| NEAR | 22 | 90.9% | 15.49 | 0.706 | 0% | OK |
| SOL | 19 | 73.7% | 4.78 | 0.508 | 16% | OK |
| BNB | 21 | 66.7% | 3.07 | 0.328 | 52% | INVESTIGATE |
| XRP | 18 | 66.7% | 3.72 | 0.421 | 0% | INVESTIGATE |
| ETH | 28 | 64.3% | 2.09 | 0.197 | 57% | INVESTIGATE |
| LINK | 28 | 75.0% | 6.84 | 0.626 | 32% | OK |
| AVAX | 12 | 75.0% | 8.24 | 0.540 | 0% | OK |

## Artefacts

- **BTCUSDT:** `docs\exports\btc_board8_v3v4_trusted_21d_v4_trades.csv`
- **NEARUSDT:** `docs\exports\near_board8_v3v4_trusted_21d_v4_trades.csv`
- **SOLUSDT:** `docs\exports\sol_board8_v3v4_trusted_21d_v4_trades.csv`
- **BNBUSDT:** `docs\exports\bnb_board8_v3v4_trusted_21d_v4_trades.csv`
- **XRPUSDT:** `docs\exports\xrp_board8_v3v4_trusted_21d_v4_trades.csv`
- **ETHUSDT:** `docs\exports\eth_board8_v3v4_trusted_21d_v4_trades.csv`
- **LINKUSDT:** `docs\exports\link_board8_v3v4_trusted_21d_v4_trades.csv`
- **AVAXUSDT:** `docs\exports\avax_board8_v3v4_trusted_21d_v4_trades.csv`
