# Following Scanner Feature 1 — Kế hoạch triển khai

> ExtensionX **6.2.7** | Cập nhật: 2026-09-30 | Trạng thái: **Planned**

Feature 0 (tự cuộn trang `/following`) đã hoàn thành từ v5.6.0 và được ghi nhận trong [`roadmap.md`](roadmap.md). File này chỉ còn mô tả phần chưa triển khai: quét API, phân tích tài khoản không hoạt động và unfollow có kiểm soát.

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

## Kiến trúc đề xuất

```text
Popup Cleanup tab
    │ START_FOLLOWING_SCAN / STOP_FOLLOWING_SCAN
    ▼
Background following-api.ts
    ├── pagination + query-id discovery
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

## Data model dự kiến

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

## Phạm vi thay đổi dự kiến

- `src/background/following-api.ts`: pagination, activity lookup và unfollow mutation.
- `src/background/messages.ts`: message handlers và sender/payload validation.
- `src/background/state.ts`: state theo operation ID.
- `src/shared/validation.ts`: schema/giới hạn dữ liệu.
- `src/types.ts`: candidate và scan state.
- `src/popup/following-panel.ts`: scan, filter, preview, confirm và progress.
- `test/`: parser, pagination, state transition, rate-limit và abort tests.

## Thứ tự triển khai

1. Xác minh endpoint/query ID hiện hành và tạo fixture đã khử dữ liệu nhạy cảm.
2. Viết parser/validation thuần cùng unit tests.
3. Thêm scan state machine có operation ID, abort và pagination cap.
4. Xây UI kết quả + filter; chưa có unfollow ở bước này.
5. Thêm preview/xác nhận và unfollow queue tuần tự.
6. Thêm retry có giới hạn, diagnostic đã redact và smoke test Chrome thật.

## Definition of Done

- Typecheck, lint, unit và fixture e2e đều xanh.
- Scan dừng được ngay và không nhận progress từ operation cũ.
- Pagination không lặp cursor, có giới hạn số trang/bản ghi.
- Không có token, URL nhạy cảm hoặc danh sách username trong diagnostic export.
- Unfollow không thể chạy nếu chưa qua preview và xác nhận.
- 401/403/429 dừng queue, giữ báo cáo phần đã xử lý và hướng dẫn người dùng.
- Tài liệu sử dụng, changelog và roadmap được cập nhật khi phát hành.
