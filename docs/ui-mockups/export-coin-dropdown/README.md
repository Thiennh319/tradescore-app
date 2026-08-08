# UI Mockup — Export Trace + Coin dropdown

**Date:** 2026-07-22  
**Status:** Design review only — **no app component code**

## Files

| File | State |
|---|---|
| `00-overview-all-states.png` | Full page: cả 3 trạng thái |
| `01-closed.png` | Dropdown đóng — `[Tất cả coin ▾] [RuleBook Trace ▾] [📄 Export]` |
| `02-coin-open.png` | Dropdown Coin mở — cây Tất cả / BTC / NEAR / SOL / BNB |
| `03-trace-open.png` | Dropdown Trace Type mở — menu TRACE/REVIEW hiện có |
| `mockup.html` | Nguồn HTML tĩnh dùng để render PNG |

## Layout đề xuất

Thứ tự toolbar (phải → trái trong header actions hiện tại, hoặc cùng hàng):

1. **Coin ▾** (mới)
2. **Trace Type ▾** (giữ nguyên)
3. **📄 Export** (giữ nguyên)

Style: `#1E2329` surface, `#363A45` border, radius 8, chữ `#5E6673` / `#848E9C`, accent `#F0B90B` — khớp `SignalBoard` audit export.

## Hành vi (ghi trên mockup — chưa code)

- 1 coin + 1 trace + Export → file(s) của coin đó  
- Tất cả coin + Export → cùng loại trace cho BTC / NEAR / SOL / BNB  

## Render

```bash
node scripts/render-export-coin-dropdown-mockups.mjs
```
