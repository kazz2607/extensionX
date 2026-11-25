# Kế hoạch nâng cấp v8.2.3 → v9.0

> Lập ngày 2026-11-25 trên mã nguồn **8.2.2** (commit `bef46a8`) | Trạng thái: **đang thực hiện — v8.2.3 và v8.3.0 đã phát hành (xem mục 6a, 6b)**

Kế hoạch này kế tiếp [`upgrade-plan-v7.3-v8.md`](upgrade-plan-v7.3-v8.md) (L1–L15, S1–S11, P1–P15, U1–U16, F1–F5 đã xong). Mã định danh mới đánh tiếp từ số cuối của kế hoạch cũ.

## Phương pháp và mức tin cậy

Kiểm tra chỉ đọc toàn bộ `src/`, `test/`, `scripts/`, `src/manifest.json` theo bốn mảng (hiệu năng, bảo mật, UI/UX, logic), đối chiếu với các mục đã hoàn thành để không lặp lại. Mỗi mục ghi mức tin cậy:

- **✔ Đã xác minh** — đã đọc lại đúng dòng code và xác nhận hành vi.
- **◐ Từ audit** — phát hiện có trích dẫn vị trí cụ thể, chưa đọc lại độc lập; xác minh trước khi sửa.
- **? Cần kiểm chứng** — giả thuyết hợp lý, cần fixture hoặc thử trên X/Telegram thật.

Trạng thái gate tại thời điểm lập kế hoạch: `npm run check` xanh (76 unit, 2 e2e), tổng JS 381,5/420 KB, service worker 115,8/120 KB, 107/110 module, `npm audit --omit=dev` 0 lỗ hổng.

## Ràng buộc (giữ nguyên từ CLAUDE.md)

- Không nâng `DB_VERSION` (3). Dữ liệu mới dùng key mới trong `chrome.storage.local`; enum mới lưu ở dạng bản cũ đọc được.
- Không thêm quyền hay host permission. **Giảm** quyền thì được (xem S19).
- Message mới khai báo đủ `MessageType`, `MESSAGE_TYPES`, `PAYLOAD_KEYS`, kiểu response; dữ liệu từ trang/storage/file đi qua validator trong `src/shared/`.
- Không viết chữ tiếng Việt trong dòng code; chuỗi UI thêm cả `en` và `vi`.
- Ngân sách build: tổng JS ≤ 420 KB, file lớn nhất ≤ 120 KB, ≤ 110 module. **Service worker chỉ còn ~4 KB** — mọi mục thêm code vào SW phải đi sau hoặc cùng P26.

## Tổng quan ưu tiên

| Mốc | Trọng tâm | Mục |
| --- | --- | --- |
| **v8.2.3** ✅ | Hotfix: mất dữ liệu ZIP, kẹt UI, bảo mật dễ sửa | L16–L20, L22, L24, S12, S13, S15, U17, U19, P16 |
| **v8.3.0** ✅ (trừ L28–L30, S19 quyền) | Logic còn lại + hardening + hiệu năng IndexedDB | L21, L25–L27, S14, S16–S18, P17–P19, P23, P24, P27, S19 (giảm quyền) |
| **v8.3.1** | UI/UX và accessibility | U18, U20–U30 |
| **v8.4.0** | Dung lượng và main thread | P26 (bảng dịch theo locale), P20–P22, P25, kiểm chứng HLS fMP4 (L28) |
| **v9.0.0** | Tính năng mới | F3b, F1b, F1c, F6, F9, F10 (xem mục 5) |

---

## 1. Sửa lỗi logic

### P0 — v8.2.3

| ID | Tin cậy | Vị trí | Lỗi | Hướng sửa | Test hồi quy | Công |
| --- | --- | --- | --- | --- | --- | --- |
| **L16** | ✔ | `src/offscreen/offscreen.ts:78` | Khi cộng dồn vượt `ZIP_MAX_BYTES` (500 MiB) vòng lặp `break` → **toàn bộ file còn lại của chunk bị bỏ**, không vào ZIP nào, nhưng `ZIP_PROGRESS` vẫn báo đủ. File đơn > 500 MiB không bao giờ được ZIP. | Vượt ngưỡng thì đóng phần hiện tại, mở phần mới cho file còn lại; file đơn quá ngưỡng thì bỏ qua có đếm. Gửi số file bị bỏ kèm `ZIP_DONE`. Tách logic chia phần thành hàm thuần trong `src/shared/`. | Unit: ngưỡng nhỏ, tổng entry các phần = số item hợp lệ. | S |
| **L17** | ◐ | `src/background/p2-messages.ts:35-45`, `offscreen.ts:74` | `collect` cho ZIP không loại `type === 'hls'` → ZIP chứa file playlist `.m3u8` dạng text thay vì video. | Loại `hls` khỏi ZIP và báo số mục bị loại (tài liệu P2 đã nói HLS không vào ZIP — code chưa thực thi). | Unit cho `collect`. | S |
| **L19** | ✔ | `src/background/downloader.ts:133-137`, `p2-messages.ts:17` | `scheduleOffscreenClose` chỉ xét `pendingHlsRequests`; `ensureOffscreenDocument` không huỷ hẹn giờ đóng → bấm ZIP trong 30 s sau một lượt HLS/Stop thì offscreen bị đóng giữa chừng, ZIP chết im lặng (không `ZIP_FAILED`). | Một bộ đếm "lease" offscreen dùng chung cho HLS và ZIP trong một module; ZIP giữ lease tới `ZIP_DONE`/`ZIP_FAILED`. | Chromium: HLS xong rồi ZIP ngay → ZIP hoàn tất. | M |
| **L20** | ◐ | `downloader.ts:403-421`, `popup.ts:731`, `content.ts:212` | Nhánh thoát sớm của `startDownload` (0 item, 0 skip) không gửi `DOWNLOAD_DONE`/`FAB_UPDATE`; lỗi trả về từ `START_DOWNLOAD` (đang bận) bị bỏ qua → popup/FAB **kẹt "đang tải"**; nút Stop khi đó dừng nhầm lượt của profile khác. | Mọi nhánh thoát gửi `DOWNLOAD_DONE` (kèm `error`); popup/FAB khôi phục trạng thái khi response có `error`. | e2e: `START_DOWNLOAD` với `selectedUrls` không tồn tại → nhận `DOWNLOAD_DONE`. | S |
| **L22** | ✔ | `src/background/scraper.ts:316` | `tab.url.includes('/media')` → handle bắt đầu bằng "media" (vd. `x.com/mediapart`) bị coi là đã ở trang Media, không điều hướng, `SCROLL_DOWN` trả `not_media_page`, thu thập dừng ngay. | So bằng `isCollectMediaPageUrl` + `usernameFromXUrl` trong `src/shared/collection-source.ts`. | Unit cho hàm kiểm tra trang. | S |
| **L24** | ◐ | `scraper.ts:362-371` | Dừng vì đạt `max_scrolls` không gọi `broadcastFABState(tabId, 'COLLECT_DONE')` → FAB kẹt trạng thái thu thập. | Thêm broadcast như các nhánh dừng khác. | e2e fixture `max_scrolls` nhỏ. | S |

### P1 — v8.3.0

| ID | Tin cậy | Vị trí | Lỗi | Hướng sửa | Công |
| --- | --- | --- | --- | --- | --- |
| **L18** | ◐ | `offscreen.ts:46` | Tên entry ZIP lấy từ đoạn cuối URL → ảnh dạng `…/media/ABC?format=jpg&name=orig` thành `ABC` không đuôi; không chống trùng tên trong cùng ZIP. | Tên = phần cơ sở + `.${item.ext}`, trùng thì thêm `_2`. Unit `zipFilename`. | S |
| **L21** | ◐ | `src/content/page-interceptor.ts:296`, `dom-scanner.ts:85` | Cùng một ảnh có hai dạng URL (`…/ABC.jpg` từ GraphQL và `…/ABC?format=jpg&name=orig` từ DOM) → hai `MediaItem`, tải hai file; bản GraphQL có thể không phải `orig` (?). | Hàm chuẩn hoá URL ảnh dùng chung trong `src/shared/`, áp ở interceptor, scanner và `addMediaItems`. Dữ liệu cũ trong IndexedDB: chuẩn hoá khi đọc, **không** đổi schema. | M |
| **L23** | ◐ | `src/shared/validation.ts:70`, `scraper.ts:303` | Khoá `<user>_likes` trùng với handle thật kết thúc bằng `_likes`; `/status/<id>/likes` cũng bị nhận là trang likes. | Chỉ sửa phần nhận diện URL `/status/…/likes` ngay. Đổi tiền tố khoá (`_likes_<user>`) cần migration và đường rollback — **để sau, chỉ làm khi có báo cáo người dùng.** | S / M |
| **L25** | ◐ | `src/background/queue.ts:17,36-41` | `_forceDedupOnNextRun` chỉ nằm trong RAM; SW bị kill hai lần liên tiếp thì Resume tải lại toàn bộ thành file "(1)". | Lưu cờ ở key mới `queue_force_dedup_v1`. Unit: hydrate hai lần vẫn giữ `skipDuplicates=true`. | S |
| **L26** | ◐ | `p2-messages.ts:140` | Lượt chạy theo lịch ghi `lastStatus='completed'` ngay khi bắt đầu (L14 chưa trọn): 0 media hoặc toàn lỗi vẫn hiện "completed". | `startDownload` trả kết quả; ghi trạng thái khi xong, dùng giá trị enum bản cũ đọc được. | S |
| **L27** | ◐ | `options.ts` (`imgQuality`), `dom-scanner.ts:105`, `downloader.ts:575-579` | (a) Tuỳ chọn `imgQuality` không nơi nào đọc; (b) ảnh từ DOM luôn `ext:'jpg'` (PNG/WebP sai đuôi); (c) sau khoảng nghỉ `delayMs` không kiểm tra lại `pauseGate` → có thể gửi request khi đang nghỉ 429. | (a) Nối vào chuẩn hoá L21 hoặc bỏ tuỳ chọn; (b) lấy `format=` từ URL; (c) `await pauseGate` sau delay. | S |
| **L28** | ? | `src/lib/hls-fetcher.ts:133-176` | Parser bỏ qua `#EXT-X-MAP` (init segment) và `#EXT-X-MEDIA` (audio riêng); segment `.m4s` đường dẫn tương đối có thể không khớp. Nếu X phục vụ fMP4 → "No segments found" hoặc video không tiếng. Đuôi `.ts` nhưng blob `video/mp4`. | Thu một playlist X thật làm fixture trước; nếu đúng, hỗ trợ MAP + audio rendition. | M |
| **L29** | ? | `downloader.ts:270-345` | Tải từ nút tweet không qua `downloadCoordinator` → Stop không dừng được; thiếu username thì chống trùng theo khoá `'unknown'`. | Đưa qua coordinator; khoá chống trùng theo username của tweet. | M |
| **L30** | ? | `downloader.ts:46` | Alarm keep-alive `periodInMinutes: 0.4` dưới tối thiểu 0,5 của Chrome (bị kéo lên 30 s, sát ngưỡng idle 30 s). Thực tế `downloads.onChanged` có lẽ giữ SW sống. | Đo bằng Chromium acceptance với lượt tải dài; sửa comment/giá trị cho khớp thực tế. | S |

---

## 2. Bảo mật

### P0 — v8.2.3

| ID | Tin cậy | Vị trí | Kịch bản | Hướng sửa | Công |
| --- | --- | --- | --- | --- | --- |
| **S12** (Medium) | ✔ | `src/popup/following-panel.ts:401-405` | Export CSV Following tự ghép chuỗi, chỉ nhân đôi `"`, **không qua `csvCell()`**. Chủ một tài khoản bất kỳ mà nạn nhân follow đặt displayName/bio `=HYPERLINK(...)`/`=WEBSERVICE(...)` → công thức chạy khi mở bằng Excel/Sheets. Cùng chỗ: chuỗi tiếng Việt `'Tài khoản giễu nhại'` nằm trong code (xem U27). | Mọi cột qua `csvCell()`; unit test với giá trị bắt đầu bằng `= + - @`. | S |
| **S13** (Low–Medium) | ✔ | `src/content/tweet-btn.ts:239-250`; `shortcuts.ts:128,134`; `tg-content.ts:262,440` | Không kiểm tra `event.isTrusted` → script trên trang (XSS, script bên thứ ba, extension khác ở MAIN world) gọi `.click()` lên mọi `.xmd-dl-btn` hoặc dispatch phím/chuột giả để kích hoạt tải hàng loạt, lách cảnh báo "automatic downloads" của Chrome. S1 mới áp yêu cầu user gesture cho FAB. | `if (!e.isTrusted) return;` ở cả ba nơi. Lâu dài: nút tweet chuyển sang isolated world/closed shadow root như FAB. | S |
| **S15** (Low) | ✔ | `page-interceptor.ts:137` (và nhánh `/graphql/` ở `:165`, `:211`) | Lọc host bằng `url.includes('x.com/i/api')` → trang gọi `fetch('https://evil.tld/x.com/i/api', {headers:{authorization:…}})` để đầu độc bearer mà SW dùng (`tweet-api.ts:73`) cho mọi request có cookie, gồm `friendships/destroy`. Hậu quả chủ yếu: DoS luồng tải/unfollow. | `new URL(url).hostname` thuộc tập {`x.com`, `api.x.com`, `twitter.com`, `api.twitter.com`}; áp cho cả nhánh GraphQL/QueryId. | S |

### P1 — v8.3.0

| ID | Tin cậy | Vị trí | Kịch bản | Hướng sửa | Công |
| --- | --- | --- | --- | --- | --- |
| **S14** (Low) | ◐ | `tg-content.ts:113-136`, `tg-main.ts:55-56,172-175` | Bridge Telegram vẫn dùng `CustomEvent` trên `window` (mẫu S1 đã bỏ ở X): trang đọc được yêu cầu tải và giả `STATUS_EVENT` vì id đoán được (`tg-${Date.now()}-seq`). | Dùng lại `page-bridge` MessagePort; tối thiểu id bằng `crypto.randomUUID()`. | M |
| **S16** (Low) | ◐ | `src/shared/messages.ts:227-231`, `media-messages.ts:229-243` | `CONTENT_SCRIPT_TYPES` không gắn origin: content script Telegram gửi được `START_COLLECTING` với username tuỳ ý (kiểm tra tab chỉ chạy khi sender là tab X). Cần renderer bị chiếm. | Ánh xạ type → origin hợp lệ trong `isAllowedSender` theo `sender.tab.url`. | S |
| **S17** (Low) | ◐ | `options.ts:479,547`, `popup.ts:818` | Không giới hạn kích thước file trước `JSON.parse` khi import → chọn nhầm file lớn làm treo trang. | Từ chối `file.size` > 20 MB với thông báo i18n. | S |
| **S18** (Low) | ? | `src/shared/telegram-media.ts:28` | `isTelegramDownloadUrl` nhận cả `data:image/svg+xml`; phần mở rộng không bị ép theo MIME → có thể ghi SVG chứa script ra đĩa. | Loại `svg+xml`; ép phần mở rộng theo MIME. | S |
| **S19** | ◐ | `src/manifest.json` | **Giảm quyền** (xem bên dưới). | — | M |
| **S20** | ◐ | `.github/workflows/quality.yml` | Action pin theo tag `@v4`, không theo SHA (rủi ro thấp: chạy tay, `contents: read`). | Pin theo commit SHA. | S |

### S19 — Cơ hội giảm quyền

1. **Bỏ `scripting`:** chỉ dùng ở `media-messages.ts:516` để click `<a download>` trong MAIN world cho `TG_DOWNLOAD_MEDIA`; `tg-content`/`tg-main` cùng DOM có thể tự làm. Cần Chromium acceptance cho Telegram.
2. **Thu hẹp host:** `https://*.x.com/*`, `https://*.twitter.com/*` → `https://x.com/*`, `https://api.x.com/*`, `https://twitter.com/*` (SW chỉ fetch các host này, `tweet-api.ts:90,271,325,477`); sửa kèm pattern ở `scraper.ts:272`.
3. **`shortcuts.ts`:** bỏ `*.x.com`/`*.twitter.com` khỏi `matches` (trên subdomain `SHORTCUT_DOWNLOAD` luôn bị `isXUrl` từ chối) và bỏ `exclude_matches` Gmail/Docs/Notion vô tác dụng.

**Lưu ý rollback:** thu hẹp quyền thì cập nhật lên không hỏi lại, nhưng **rollback về 8.2.x sẽ xin lại quyền rộng hơn** và Chrome có thể tạm tắt extension chờ người dùng đồng ý. Ghi vào `v7-migration-rollback.md` trước khi phát hành; cân nhắc tách S19 thành bản riêng.

---

## 3. Hiệu năng

### P1 — v8.2.3 / v8.3.0

| ID | Tin cậy | Vị trí | Vấn đề | Hướng sửa | Công |
| --- | --- | --- | --- | --- | --- |
| **P16** | ✔ | `downloader.ts:511`, `src/background/failed-items.ts:49-73` | Mỗi file lỗi ghi lại **toàn bộ** `failed_items_v1` (≤ 500 mục, ~250 KB). Mất mạng giữa lượt 500 file → serialize O(n²) (~60 MB ước tính) và mỗi lần ghi bắn `storage.onChanged` tới mọi tab X/Telegram. | Gom bản ghi lỗi trong lượt tải và ghi một lần ở chỗ đã `await Promise.all(failureWrites)` (`downloader.ts:604`), hoặc debounce ~1 s. | S |
| **P17** | ◐ | `scraper.ts:123-131,600-604`, `popup.ts:486-490` | Mở popup khi SW vừa thức gửi song song `GET_MEDIA_COUNT` + `GET_STATS` → hai lần `getAll` cùng profile (≤ 50k bản ghi). `loadDownloadedUrls` cùng lỗi. | `Map<username, Promise>` gộp lần nạp đang chạy; nhớ profile rỗng là đã nạp. | S |
| **P18** | ◐ | `indexeddb.ts:274-300` | `pruneDownloadedUrls` `getAll`+filter+sort trong transaction readwrite, ngay sau đó `getDownloadedUrls` lại `getAll`. Chạy ở lần dùng đầu mỗi profile sau mỗi lần SW restart. | Một lượt cursor trên index `username` vừa xoá hết hạn vừa thu URL; chỉ sort khi vượt giới hạn (giống P10). Không đổi `DB_VERSION`. | M |
| **P19** | ◐ | `src/background/state.ts:9,21-36` | `trimMediaCache` không loại `downloadedStore` → mỗi profile giữ tới 50k URL trong RAM SW suốt Queue dài. | Loại cùng media cache, trừ profile đang tải/có dữ liệu chưa ghi. | S |
| **P23** | ◐ | `page-interceptor.ts:47,358-370` | Cùng một `<video>` gắn lại vào DOM bị gắn thêm listener mỗi lần; `seenUrls` tăng suốt phiên. | `WeakSet` cho video đã gắn; clear/giới hạn `seenUrls` khi điều hướng. | S |
| **P24** | ◐ | `hls-fetcher.ts:47-58`, `offscreen.ts:126-131` | HLS tải theo lô 8 segment phải chờ segment chậm nhất; `HLS_PROGRESS` gửi mỗi segment không throttle. | Pool cửa sổ trượt (đã có mẫu `runWithConcurrency`); throttle ~4 Hz. | S |
| **P27** | ◐ | `media-messages.ts:125-145`, `tweet-api.ts:468-538` | Tra video cho placeholder không có negative cache/gộp lời gọi: tweet không ra kết quả bị tra lại mỗi lô, tới 4 request/lần. | `Map<tweetId, Promise>` + negative cache TTL ~10 phút. | S |

### P2 — v8.4.0

| ID | Tin cậy | Vị trí | Vấn đề | Hướng sửa | Công |
| --- | --- | --- | --- | --- | --- |
| **P20** | ◐ | `indexeddb.ts:332-360`, `storage-messages.ts:40,66` | `getStorageSummary` quét cursor + `JSON.stringify` từng record của cả hai store; lệnh prune gọi hai lần. | Đếm bằng `openKeyCursor` trên index; ước lượng byte theo `navigator.storage.estimate()`. | M |
| **P21** | ? | `page-interceptor.ts:211-231,245-347` | Trên route profile, mọi response GraphQL bị parse lại và duyệt đệ quy toàn cây (sâu 35) trên main thread, kể cả operation không có media. | Danh sách loại trừ operation; không đi xuống `user_results`/`card`. **Benchmark trước khi sửa.** | M |
| **P22** | ◐ | `page-interceptor.ts:390`, `dom-scanner.ts:243`, `tweet-btn.ts:339` | Ba MutationObserver subtree song song; observer dom-scanner không gate theo route và vẫn post `XMD_DIAGNOSTIC_METRIC` qua bridge khi diagnostics tắt. | Một observer dùng chung trong `main-world`, gate theo route, đẩy cờ diagnostics xuống trang. | M |
| **P25** | ◐ | `offscreen.ts:72-86` | ZIP fetch tuần tự tối đa 200 file. | Fetch song song 4–6, giữ thứ tự và giới hạn byte (làm cùng L16). | S–M |
| **P26** | ◐ | `src/lib/i18n/`, `vite.config.ts` | SW 115,8/120 KB. Phân bổ: `downloader` 14,9 KB, `scraper` 10,4, `media-messages` 9,4, `tweet-api` 8,9, `i18n/background` 8,0, `indexeddb` 6,7. | (a) Xuất bảng `vi` ra JSON trong gói, `loadI18n()` `fetch(chrome.runtime.getURL(...))` — `import()` động bị cấm trong SW; `i18nReady` đã được await. Tiết kiệm ~4,4 KB ở SW, ~12 KB ở popup. (b) Bỏ `console.log/debug` khi build (~1,6 KB). | M |

---

## 4. Giao diện (UI/UX)

Đã kiểm bằng script: key en/vi khớp 100%, placeholder khớp, không có key bị gọi mà thiếu định nghĩa; U1–U16 không tái phát.

### P1 — v8.2.3 (U17, U19) / v8.3.1

| ID | Tin cậy | Vị trí | Người dùng thấy | Hướng sửa | Công |
| --- | --- | --- | --- | --- | --- |
| **U17** | ✔ | `src/popup/date-range.ts:118-126` | Preset 7/30/90 ngày dùng `toISOString()` (UTC) trong khi lọc theo giờ máy → ở UTC+7 bấm "7 ngày" trước 7h sáng thì **media hôm nay bị loại**; preset "Năm nay" lại theo giờ máy. | Helper `localIsoDate(d)` trong `src/shared/`, unit test với TZ khác 0. | S |
| **U19** | ◐ | `following-panel.ts:165,372-373` | "Chọn đang hiển thị" chọn **mọi** mục đã lọc, kể cả mục không render (list chỉ hiện 100) — thao tác dẫn tới unfollow hàng loạt, hộp xác nhận chỉ liệt kê 10. | Chỉ chọn mục đang render, hoặc đổi nhãn "Chọn tất cả (n)" và xác nhận ghi rõ tổng. | S |
| **U18** | ◐ | `following-panel.ts:365-370` | Tick checkbox dựng lại cả list → mất focus, không chọn liên tiếp bằng bàn phím/screen reader được. | Chỉ cập nhật tiêu đề và nút (như `download-center.ts:407`). | S |
| **U20** | ◐ | `src/content/fab-dom.ts:64`, `snackbar.ts` | FAB không có `aria-label`/`aria-expanded`, screen reader đọc "0, button"; không đóng panel bằng Escape; snackbar thiếu `role="status"`. | Thêm thuộc tính qua i18n và xử lý Escape. | S |

### P2 — v8.3.1

| ID | Vị trí | Vấn đề | Hướng sửa | Công |
| --- | --- | --- | --- | --- |
| **U21** | `following-panel.ts:380`, `options.ts:466-765`, `download-center.ts:350,429`, `popup.ts:919-927` | Xác nhận không nhất quán: Options/Download Center dùng `confirm()` gốc; "Clear history" của popup và "Remove selected" trong Download Center **không có xác nhận**. | Thêm xác nhận; dùng chung `<dialog>`. | M |
| **U22** | `queue-panel.ts:221`, `download-center.ts:89,259,299`, `popup.ts:1106`, `status-bar.ts:23` | Giá trị enum thô chưa dịch (`media · images`, phase, state trong aria-label). | Map qua key có sẵn (`tab_images`…), thêm key cho phase/state. | S |
| **U23** | `download-center.html:54-153` | Kicker hard-code tiếng Anh và là thuật ngữ nội bộ ("P2 TOOLKIT", "MV3 SCHEDULE"); nút "Save Saved Job". | `data-i18n` với nhãn cho người dùng, hoặc bỏ kicker. | S |
| **U24** | `options.ts:692-704`, `popup.ts:857-886,1045` | `toLocaleString()` theo locale trình duyệt, không theo ngôn ngữ app. | Helper `formatNumber(n)` theo `i18n.lang`. | S |
| **U25** | `popup.html:213-217`, `popup.ts:1124` | Thanh progress thiếu `role="progressbar"`; `#status-text` `aria-live` đọc mỗi lần progress (rất ồn); `#status-dot` không có role. | Role/aria đúng; chỉ announce khi bắt đầu/kết thúc. | S |
| **U26** | `donut-chart.ts:31`, `popup.html:435` | Tổng > 9999 luôn hiện "9k+" (25 000 cũng vậy); màu hard-code; SVG thiếu `role="img"`. | `Intl.NumberFormat(lang, {notation:'compact'})`, token màu. | S |
| **U27** | `following-panel.ts:262,403`, `tg-content.ts:165` | Nhận diện tài khoản parody chỉ bằng chuỗi tiếng Việt → X tiếng Anh không có badge; nút tải gốc Telegram tìm theo `title` "Download"/"Tải xuống" → ngôn ngữ khác thì fallback hỏng. | Ưu tiên tín hiệu cấu trúc (trường API/selector), text làm phụ; chuỗi đối chiếu chuyển vào bảng dữ liệu. | M |
| **U28** | `following-panel.ts:176,272,289-295` | Link `↗` chỉ có `title`; `displayName` thiếu `dir="auto"` (tên RTL đảo thứ tự với `@handle`). | aria-label kèm username, `dir="auto"`. | S |
| **U29** | `popup.html` (32 `style=""`), `options.html` (21), `following-panel.ts:159`, `options.ts:699`, `popup.css:2303` | Style inline và màu bỏ qua token. | Chuyển sang class/token. | M |
| **U30** | `src/lib/i18n/` | Key chết: `queue_empty_msg`, `popup_theme_toggle`. | Xoá, hoặc nối `popup_theme_toggle` vào `btn-theme`. | S |

**Cần kiểm chứng trên X thật:** `tweet-btn.ts:151` lấy `a[href*="/status/"]` đầu tiên — tweet có quote có thể lấy nhầm ID; chuỗi tiếng Việt trong `.queue-tools` (`white-space:nowrap`) có tràn ở 440 px không.

---

## 5. Tư vấn tính năng mới (v9.0)

Đã loại các ý tưởng trùng với tính năng hiện có (template tên file `{username}/{tweetId}/{date}/{type}/{index}`, Smart Auto-Stop, Watch mode, ZIP, lịch Saved Job, backup).

| ID | Tính năng | Giá trị | Công | Rủi ro | Khuyến nghị |
| --- | --- | --- | --- | --- | --- |
| **F3b** | **Đổi chất lượng khi thử lại** (tồn đọng F3): lưu danh sách variant video đang bị bỏ ở 3 chỗ chọn `bestMp4`, Download Center cho chọn variant thấp hơn khi bản cao lỗi. Lưu variant trong `MediaItem` dạng trường tuỳ chọn (bản cũ bỏ qua). | Cao | M | Thấp | **Nên làm trước** |
| **F1b** | **X Lists** (tồn đọng F1): thu thập từ `/i/lists/<id>`, khoá `_list_<id>` theo mẹo `collection-source.ts`, tên list qua operation riêng. | Cao | M | Thấp | **Nên làm** |
| **F1c** | **Search/Hashtag trong Queue** (tồn đọng F1): Queue nhận "nguồn" thay vì chỉ username. | Trung bình | S–M | Thấp | Nên làm cùng F1b |
| **F6** | **Tải thread/hội thoại** từ `TweetDetail`: media của các tweet cùng tác giả trong thread. `extractMediaFromResponse` vốn quét đệ quy nên phần thu thập nhỏ; phần chính là lọc theo tác giả và nút trên trang tweet. | Trung bình | S–M | Thấp | Nên làm |
| **F9** | **Chế độ chọn nhiều trên timeline:** bật chế độ chọn, nút tweet thành checkbox, tải một lượt các tweet đã chọn (đi qua coordinator, sửa luôn L29). | Trung bình–Cao | M | Thấp | Cân nhắc |
| **F10** | **Tìm theo caption trong Gallery/Download Center:** `tweetText` đã có trong Manifest; thêm ô tìm kiếm và lọc theo ngày trên dữ liệu IndexedDB bằng cursor có giới hạn. | Trung bình | M | Thấp | Cân nhắc |
| **F11** | **Tự thử lại file lỗi sau khi hết nghỉ 429:** gom file lỗi lý do `rate_limit`/`server` và thử lại một lần qua `chrome.alarms` (tôn trọng lịch nghỉ F4). | Trung bình | S | Thấp | Cân nhắc |
| F7 | Telegram: tải hàng loạt theo khoảng tin nhắn/album. | Trung bình | L | Trung bình — DOM Telegram đổi thường xuyên | Sau v9 |
| F8 | Bản Firefox MV3 (cần adapter offscreen/`world: MAIN`). | Trung bình | L | Trung bình | Sau v9 |
| — | Cloud sync, tải Spaces/audio, tự động unfollow nền, đặt ngày sửa file theo ngày tweet (`chrome.downloads` không hỗ trợ) | — | — | Cao/không khả thi | **Không khuyến nghị** |

**Ngân sách cho v9.0:** F3b, F1b, F1c đều thêm code vào service worker → phải xong P26 (v8.4.0) trước. Ước tính sau P26 còn ~8–10 KB cho SW.

---

## 6. Thứ tự thực hiện đề xuất

1. ~~**v8.2.3 — hotfix**: L16, L17, L19, L20, L22, L24, S12, S13, S15, U17, U19, P16~~ — hoàn thành 2026-11-25 (xem 6a), kèm L18.
2. ~~**v8.3.0 — logic + hardening + IndexedDB**~~ — hoàn thành 2026-11-25 (xem 6b); còn lại chuyển sang mốc sau: L28 (cần playlist X thật), L29, L30 (cần đo), S19 bỏ `scripting`/thu hẹp host (bản riêng), Chromium acceptance L19/L20. Phạm vi gốc: L21, L25–L27, S14, S16–S18, S20, P17–P19, P23, P24, P27. S19 (giảm quyền) làm cuối mốc hoặc tách bản riêng, có ghi chú rollback.
3. **v8.3.1 — UI/UX**: U18, U20–U30.
4. **v8.4.0 — dung lượng/main thread**: P26 trước, rồi P20–P22, P25; thu fixture HLS thật cho L28; đo L30.
5. **v9.0.0 — tính năng**: F3b → F1b + F1c → F6; F9–F11 tuỳ phản hồi.

Song song, việc thủ công còn tồn từ kế hoạch cũ: kiểm thử trên X/Telegram thật (Search/Hashtag, 429 thật, backup giữa hai máy) và đo các chỉ tiêu hiệu năng chưa đo trong `quality-gate.md`.

## 6a. Kết quả v8.2.3

- Đã sửa: L16, L17, L18 (làm cùng L16 vì cùng hàm), L19, L20, L22, L24, S12, S13, S15, U17, U19, P16.
- **Phát hiện thêm khi sửa L19:** offscreen gửi `ZIP_PROGRESS`/`ZIP_FAILED` nhưng hai message này chưa từng có trong `MESSAGE_TYPES`, nên service worker từ chối và **mọi lỗi ZIP trước đây đều im lặng**. Thay bằng một message `ZIP_DONE` (chỉ nhận từ offscreen, payload theo allowlist) mang kết quả vào Notification Center.
- Lease offscreen nằm trong `downloader.ts` (`holdOffscreen`/`releaseOffscreen`), không thêm module (vẫn 107/110). Một lượt ZIP giữ lease tới `ZIP_DONE` hoặc tối đa 30 phút; lượt ZIP thứ hai bị từ chối trong lúc lượt đầu chạy.
- L20 mở rộng: nhánh đọc bộ nhớ media lỗi cũng báo `DOWNLOAD_DONE` (kèm `error`) và tắt keep-alive (trước đây alarm keep-alive chạy tiếp).
- Test: `test/v8-2-3-hotfix.test.ts` (7 test) — 83 unit, Chromium 9/9 trên Chrome for Testing 158. **Chưa có Chromium acceptance riêng cho L19/L20**: START_DOWNLOAD từ trang extension trong tab bị từ chối nên cần dựng luồng qua FAB thật — để ở v8.3.0.
- Ngân sách: tổng JS 384,1 KB; service worker 117,0/120 KB (+1,0 KB).

## 6b. Kết quả v8.3.0

- **Đã làm:** L21, L23 (phần nhận diện URL — không đổi tiền tố khoá `_likes`), L25, L26, L27 (a, b, c); S14 (mức tối thiểu: id ngẫu nhiên), S16, S17, S18, S19 (chỉ phần content script), S20; P17, P18, P19, P23, P24, P27; P26b (bỏ `console.log/debug/info`).
- **L21 và rollback:** khoá chống trùng ảnh đổi sang dạng chuẩn. Ba lớp bảo vệ: (1) khoá cũ được chuẩn hoá lại khi nạp (`loadDownloadedUrls`, ước tính); (2) mỗi lượt tải loại ảnh trùng theo khoá chuẩn, nên dữ liệu cũ giữ cả hai dạng URL vẫn chỉ tải một file; (3) URL ảnh không query được ghi thêm khoá dạng cũ để bản 8.2.x vẫn nhận ra file đã tải sau rollback.
- **Phát hiện thêm:** `markDownloaded` tạo tập rỗng cho profile chưa nạp (vd. tải từ nút tweet khi tắt chống trùng), khiến lần nạp sau bỏ qua lịch sử trong IndexedDB — đã sửa; backup gộp cả URL đang chờ ghi (trước đây chỉ gộp tập trong bộ nhớ).
- **S14:** không chuyển Telegram sang MessagePort vì script Telegram chạy ở `document_idle` (sau script trang) nên không bảo đảm được bắt tay trước trang; tác động thấp (trang vốn tự tải được nội dung cùng origin).
- **Chưa làm:** L28 (fixture HLS fMP4 thật), L29 (nút tweet qua coordinator), L30 (đo keep-alive), Chromium acceptance cho L19/L20, S19 bỏ `scripting`/thu hẹp host (bản riêng, cần ghi chú rollback), L23 đổi tiền tố khoá.
- Test: `test/v8-3-0.test.ts` (8 test) — 91 unit, Chromium 9/9. Ngân sách: tổng JS 386,0 KB; service worker **118,9/120 KB** — P26a là điều kiện trước mọi tính năng mới ở service worker.

## 7. Việc tài liệu kèm theo

- ~~`roadmap.md` còn ghi 73 unit test và 7 Chromium acceptance~~ — đã cập nhật ở 8.2.3.
- Mỗi mốc cập nhật `security-permissions.md` (S12–S20), `performance-baseline.md` (P16–P27, số đo SW sau P26), `quality-gate.md` (test mới).

## 8. Tiêu chí hoàn thành chung

- `npm run check` và `npm run test:browser` xanh ở mọi mốc.
- Mỗi mục L/S có ít nhất một regression test (unit hoặc Chromium acceptance).
- Không tăng quyền; S19 giảm quyền có ghi chú rollback.
- Ngân sách build giữ nguyên ngưỡng 420 KB / 120 KB / 110 module; SW ≤ 112 KB sau v8.4.0.
- Không có chuỗi tiếng Việt trong dòng code (`npm run i18n`), kể cả chỗ đang được allowlist ở `check-i18n.mjs` cho `following-panel.ts`.
