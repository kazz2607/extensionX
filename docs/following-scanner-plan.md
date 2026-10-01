# Following Scanner Feature 1 — Kế hoạch triển khai

> ExtensionX **7.1.0** | Cập nhật: 2026-10-01 | Trạng thái: **Implemented**

Feature 0 (tự cuộn trang `/following`) đã hoàn thành từ v5.6.0. Feature 1 hiện thu các response GraphQL Following do chính trang X tải trong lúc auto-scroll, normalize/validate tại boundary, phân tích hoạt động và cung cấp unfollow có kiểm soát. Không tự lưu hoặc phát lại cookie/token.

## Mục tiêu

- Quét toàn bộ danh sách Following bằng API của phiên đăng nhập hiện tại.
- Hiển thị lần hoạt động gần nhất và cho phép lọc theo ngưỡng 3/6/12 tháng.
- Cho người dùng chọn tài khoản, xem preview và xác nhận trước khi unfollow.
- Có progress, stop/resume, throttle và báo cáo thành công/thất bại.

## Nguyên tắc an toàn

- Không yêu cầu API key bên ngoài và không lưu `auth_token`/`ct0` vào storage.
- Không unfollow tự động, không chạy nền định kỳ và không chọn sẵn tài khoản.
- Preview phải hiển thị rõ username, số lượng và tính không thể hoàn tác tự động.
- Giới hạn tốc độ bảo thủ; dừng khi gặp 401/403/429 hoặc GraphQL schema thay đổi.
- Mọi payload từ trang/API phải qua validation trước khi vào state/UI.

## Kiến trúc đã triển khai

```text
Popup Cleanup tab
    │ START_FOLLOWING_SCAN / STOP_FOLLOWING_SCAN
    ▼
Background following-scanner.ts
    ├── page/record cap + operation ID
    ├── normalize/validate user records
    ├── activity classification
    └── progress events
    │
    ▼
Preview selection
    │ explicit confirmation
    ▼
Background unfollow queue
    ├── sequential/throttled mutations
    ├── stop on auth/rate-limit errors
    └── result report
```

## Data model hiện hành

```ts
interface FollowingCandidate {
  userId: string;
  username: string;
  displayName: string;
  lastActiveAt: number | null;
  followersCount?: number;
  verified?: boolean;
  protected?: boolean;
  selected: boolean;
}

interface FollowingScanState {
  status: 'idle' | 'scanning' | 'ready' | 'unfollowing' | 'stopped' | 'error';
  scanned: number;
  total?: number;
  cursor?: string;
  candidates: FollowingCandidate[];
  error?: string;
}
```

## Phạm vi đã thay đổi

- `src/background/following-scanner.ts`: state, cap, abort và unfollow queue; `tweet-api.ts` thực hiện mutation tuần tự.
- `src/background/following-messages.ts`: handler theo domain; router `messages.ts` thực hiện sender/payload validation chung.
- `src/background/state.ts`: state theo operation ID.
- `src/shared/validation.ts`: schema/giới hạn dữ liệu.
- `src/types.ts`: candidate và scan state.
- `src/popup/following-panel.ts`: scan, filter, preview, confirm và progress.
- `test/`: parser, pagination, state transition, rate-limit và abort tests.

## Trạng thái nghiệm thu

1. Parser GraphQL, cursor và candidate đã có fixture khử dữ liệu nhạy cảm.
2. State machine có operation ID, abort, page cap 500 và operation cap 10.000.
3. UI có filter 3/6/12 tháng, trạng thái chưa xác định, selection và preview bắt buộc.
4. Unfollow chạy tuần tự, throttle 1,5–2,5 giây, tối đa 100 mục/lượt và dừng ở 401/403/429.
5. Chromium smoke bao phủ surface Following/responsive; mutation thật không chạy tự động trong CI để tránh tác vụ phá hủy tài khoản.

## Definition of Done

- Typecheck, lint, unit và fixture e2e đều xanh.
- Scan dừng được ngay và không nhận progress từ operation cũ.
- Pagination không lặp cursor, có giới hạn số trang/bản ghi.
- Không có token, URL nhạy cảm hoặc danh sách username trong diagnostic export.
- Unfollow không thể chạy nếu chưa qua preview và xác nhận.
- 401/403/429 dừng queue, giữ báo cáo phần đã xử lý và hướng dẫn người dùng.
- Tài liệu sử dụng, changelog và roadmap được cập nhật khi phát hành.
