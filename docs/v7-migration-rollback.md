# Migration và rollback v7.0.0

> Áp dụng cho nâng cấp từ **6.4.0** lên **7.0.0** | Cập nhật: 2026-09-30

## Thay đổi dữ liệu

v7.0.0 không thay đổi permission, host permission hay schema IndexedDB. Hai vùng dữ liệu cục bộ được thêm hoặc nâng cấp:

| Storage key | Schema | Nội dung | Giới hạn |
| --- | ---: | --- | ---: |
| `saved_jobs_v1` | 1 | Cấu hình Saved Jobs | 100 job |
| `download_history_v2` | 2 | Lịch sử tải có success/failed/skipped/status | 500 mục |
| `download_history` | legacy | Mirror để v6.4.0 đọc khi rollback | 20 mục |

## Nâng cấp

- Lần đầu Download Center hoặc background đọc lịch sử, raw array cũ trong `download_history` được validate rồi sao chép sang snapshot `download_history_v2`.
- Dữ liệu cũ không bị xóa. Mỗi lượt tải mới ghi snapshot v2 và đồng thời cập nhật mirror legacy.
- Saved Jobs là dữ liệu bổ sung. Raw array hợp lệ từ bản thử nghiệm được migrate sang snapshot schema 1; record sai định dạng bị bỏ qua.
- Queue, Options và IndexedDB giữ nguyên schema của v6.4.0.

Không cần thao tác thủ công: build v7 tự thực hiện migration theo kiểu đọc-tương-thích và ghi schema mới.

## Rollback về v6.4.0

1. Dừng download/Queue đang chạy và đóng Download Center.
2. Load lại artifact v6.4.0 từ `chrome://extensions`, sau đó reload các tab X.com/Telegram.
3. v6.4.0 bỏ qua `saved_jobs_v1` và `download_history_v2`; Queue, Options và media IndexedDB tiếp tục dùng bình thường.
4. Lịch sử gần nhất vẫn hiển thị nhờ mirror `download_history`. Saved Jobs không hiển thị ở v6.4.0 nhưng vẫn được giữ để dùng lại khi nâng lên v7.

Không chọn **Remove extension** nếu muốn giữ dữ liệu cục bộ; Chrome có thể xóa toàn bộ storage/IndexedDB khi gỡ extension.

## Xóa dữ liệu v7 có chủ đích

- Nút xóa history trong popup xóa cả history legacy và v2.
- Xóa từng Saved Job từ Download Center. Không có thao tác tự động xóa Saved Jobs khi rollback.
- Nếu cần reset toàn bộ, dùng chức năng reset trong Options sau khi đã xuất cấu hình cần giữ.

## Kiểm tra sau migration

- Mở Download Center từ biểu tượng tải xuống trên header popup.
- Xác nhận Queue và lịch sử hiện tại xuất hiện.
- Tạo một Saved Job, đóng/mở lại trang và xác nhận job còn tồn tại.
- Chạy job khi profile đã có media được thu thập; xác nhận lịch sử ghi success/failed/skipped.
