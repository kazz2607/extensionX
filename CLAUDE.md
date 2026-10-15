# extensionX — X Media Downloader (Chrome MV3, TypeScript, Vite)

Tài liệu chính nằm trong `docs/`: kế hoạch và tồn đọng ở `upgrade-plan-v7.3-v8.md`, gate ở `quality-gate.md`, quyền ở `security-permissions.md`, rollback ở `v7-migration-rollback.md`, ngân sách build ở `performance-baseline.md`.

## Kiến trúc

- `src/background/` — service worker (thu thập, tải, Queue, IndexedDB `XMediaDownloaderDB`).
- `src/content/main-world.ts` — bundle MAIN world (page-interceptor, dom-scanner, tweet-btn); `content.ts` — isolated world, FAB/snackbar trong closed shadow root. Hai bên chỉ nói chuyện qua bridge MessagePort (`page-bridge.ts`).
- `src/offscreen/` — HLS và ZIP (`src/shared/zip-store.ts`, STORE); offscreen không có `chrome.downloads`, lưu file qua service worker.
- `src/popup/`, `src/options/`, `src/download-center/` — trang extension.
- `src/shared/` — logic thuần có unit test; `src/shared/messages.ts` — danh sách message, payload key và allowlist lệnh content script.
- `src/lib/i18n/` — bảng dịch en/vi tách theo bề mặt.

## Quy tắc bắt buộc

- **Không nâng `DB_VERSION`** (đang là 3): bản cũ sẽ không mở được DB khi rollback. Dữ liệu mới dùng key mới trong `chrome.storage.local` (vd. `failed_items_v1`); giá trị enum mới phải lưu theo dạng bản cũ vẫn đọc được.
- **Không thêm quyền / host permission** trong `src/manifest.json`.
- Message mới: thêm vào `MessageType`, `MESSAGE_TYPES`, `PAYLOAD_KEYS`, kiểu response; chỉ đưa vào `CONTENT_SCRIPT_TYPES` khi content script thật sự cần. Dữ liệu từ trang/storage/file luôn đi qua validator trong `src/shared/`.
- **i18n:** không viết chữ tiếng Việt trong dòng code (comment thì được) — `npm run i18n` chặn. Chuỗi UI thêm cả `en` và `vi` vào bảng của đúng bề mặt; regex cần ký tự có dấu dùng escape `đ`.
- Không `any`, không `@ts-ignore`/`@ts-nocheck` (hiện 0).
- Ngân sách build (`performance-budget.json`): tổng JS ≤ 420 KB, file lớn nhất ≤ 120 KB (service worker đang ~116 KB), ≤ 110 module.
- Comment theo văn phong sẵn có (tiếng Việt hoặc tiếng Anh, giải thích *tại sao*).

## Kiểm tra

- `npm run check` trước mỗi commit: typecheck, lint, i18n, unit, e2e fixture, benchmark, audit, build, budget, release manifest.
- `npm run test:browser` (Chromium acceptance): Chrome thương hiệu bỏ qua `--load-extension`, phải dùng Chrome for Testing:
  ```bash
  npx @puppeteer/browsers install chrome@stable --path ./.cft
  PLAYWRIGHT_CHROME_EXECUTABLE="<.cft/.../Google Chrome for Testing>" npm run test:browser
  ```
  `context.route` không chặn được request của `chrome.downloads`; test tải dùng CDN giả HTTPS + `--host-resolver-rules`.
- START_DOWNLOAD từ trang extension mở trong tab bị từ chối — test bắt đầu lượt tải bằng `ADD_TO_QUEUE` + `START_QUEUE`.

## Phát hành

Mỗi bản: commit code, rồi commit `chore(release): vX.Y.Z — …` cập nhật `package.json`, `package-lock.json`, `src/manifest.json`, `CHANGELOG.md` và các file trong `docs/` (version + nội dung), `npm run check`, build lại `dist/`. Hỏi trước khi push.

## An toàn git

Không chạy `git reset --hard` / `git clean -fd` khi chưa kiểm tra `git log` và remote. Không xoá file chưa được theo dõi khi chưa sao lưu.
