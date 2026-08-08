# Task V4-EXPORT-1-BUILD — Web rebuild chứa fix Rulebook sai coin

**Ngày:** 2026-08-07  
**Version product:** **1.0.8** (không bump)  
**Commit fix:** `12144a1` — `fix(export): pick Trace/Rulebook row by context.coin (V4-EXPORT-1)`  
**Ship trước đó (chưa có fix):** `471384b`  
**Phạm vi build:** **Web only** (`npm run build:web`) — không build lại APK

---

## Trạng thái

**DONE** — Test export liên quan PASS → `build:web` OK → bundle chứa đúng `context.coin` / `pickFrozenRow(preferredCoin)`.

---

## 1. Export chỉ trên Web? (bằng chứng code)

**Không phải “ẩn hết trên APK”.** Nút `📄 Export` / `handleExportAuditPackage` trong `SignalBoard.tsx` **vẫn render trên mọi platform**. Nhánh Web chỉ quyết định **cách giao file**:

```798:806:components/dashboard/SignalBoard.tsx
        if (Platform.OS === 'web') {
          downloadTextFileWeb(
            filename,
            result.markdown,
            'text/markdown;charset=utf-8',
          );
        } else {
          await saveAndShareNativeFile(filename, result.markdown, 'text/markdown');
        }
```

Bằng chứng 1 dòng: **`if (Platform.OS === 'web') { downloadTextFileWeb(...)`** — download browser chỉ trên Web; native vẫn có nút và dùng share file.

→ Rebuild **chỉ Web** là đúng với yêu cầu task (fix nằm trong export wire dùng chung; sản phẩm dùng audit package chủ yếu qua Web EXE).

---

## 2. Version build

| Nguồn | Giá trị |
|-------|---------|
| `package.json` | **1.0.8** |
| Build script banner | `TradeScore Web EXE v1.0.8` |
| `dist/.../BUILD_INFO.txt` | `version: v1.0.8` |

**Không bump version.**

---

## 3. Commit trước build

| Kiểm tra | Kết quả |
|----------|---------|
| HEAD có fix V4-EXPORT-1 | **`12144a1`** (2 files: `exportTraceReviewWire.ts` + report INVESTIGATE/FIX) |
| Diff uncommitted trên file fix | **Không** (`git diff HEAD -- services/exportTraceReviewWire.ts` trống) |
| Working tree | Còn dirty **ngoài phạm vi** (không cần cho Web rebuild của task này) |

---

## 4. Test trước build

```text
npx vitest run `
  services/__tests__/exportAuditCoin.test.ts `
  services/__tests__/exportTraceReviewWire.test.ts `
  services/__tests__/exportTraceReviewWire.selfdoc.test.ts `
  services/__tests__/exportRuleScoreBundle.test.ts `
  services/aiExport/__tests__/aiExport.test.ts
```

| Kết quả | |
|---------|--|
| Test files | **5 passed** |
| Tests | **37 passed** |
| Duration | ~19s |

→ **PASS** rồi mới `npm run build:web`.

---

## 5. Đường dẫn output Web

| Artifact | Path |
|----------|------|
| Web EXE folder | `dist/TradeScore-Web-v1.0.8/` |
| EXE | `dist/TradeScore-Web-v1.0.8/TradeScore-Web.exe` |
| Web bundle | `dist/TradeScore-Web-v1.0.8/TradeScore-web-v1/` |
| Index JS (mới) | `dist/TradeScore-Web-v1.0.8/TradeScore-web-v1/_expo/static/js/web/index-68961f3b806e9b4f81ceb2375d4dc79f.js` |
| BUILD_INFO | `dist/TradeScore-Web-v1.0.8/BUILD_INFO.txt` (Build: 2026-08-07 12:11:21) |

Hash bundle khác bản ship `471384b` (index đổi → artifact mới).

---

## 6. Xác nhận build chứa đúng fix

Tên hàm minify mất (`preferredCoin` / `pickFrozenRow` literal = 0), nhưng **logic 3-arg + `o.coin` còn nguyên** trong minified bundle:

**Call site (tương đương `pickFrozenRow(rows, scorerVersion, context.coin)`):**
```text
exportTraceOrReviewMarkdown=function(e,o){const n=R(o.rows,o.scorerVersion,o.coin);...
```

**Body (tương đương `if (preferredCoin) { rows.find(row => row.symbol === preferredCoin) }`):**
```text
function R(e,o,n){if(0===e.length)return null;if(n){const o=e.find(e=>e.symbol===n);return null==o||o.error?null:o}...
```

→ **PASS** — Web v1.0.8 hiện tại đã ship fix V4-EXPORT-1 (Rulebook/Trace chọn đúng coin, không fallback BTC).

---

## Việc người dùng cần làm

1. Đóng EXE cũ (nếu đang mở) rồi chạy `dist/TradeScore-Web-v1.0.8/TradeScore-Web.exe`.  
2. Export Trace Rulebook theo từng coin (vd. SOL) → markdown phải khớp symbol trong file, không còn nội dung BTC khi tên file SOL.

---

## Task ID

**V4-EXPORT-1-BUILD** — hoàn thành.
