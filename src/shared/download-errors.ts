// Error messages can contain signed media URLs, query strings, or server output.
// Only expose a short, stable explanation to extension UI.
export function formatDownloadError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || '');
  if (/cancelled/i.test(raw)) return 'Đã hủy bởi người dùng';
  if (/HLS download timeout|Batch timeout|Download timeout/i.test(raw)) return 'Hết thời gian chờ tải xuống';
  if (/No valid HLS stream|No segments|HLS playlist/i.test(raw)) return 'Không đọc được luồng video HLS';
  const http = raw.match(/HTTP\s*(\d{3})/i);
  if (http) return `Máy chủ trả về lỗi HTTP ${http[1]}`;
  if (/interrupted/i.test(raw)) return 'Tải xuống bị gián đoạn';
  if (/untrusted download URL/i.test(raw)) return 'URL tải xuống không được phép';
  return 'Không thể tải tệp này';
}
