/**
 * csv.ts — một ô CSV an toàn cho dữ liệu tự do (caption tweet).
 *
 * Luôn bọc trong dấu nháy kép và nhân đôi dấu nháy bên trong (RFC 4180), nên
 * dấu phẩy và xuống dòng trong caption không làm lệch cột. Ô bắt đầu bằng
 * = + - @ (hoặc tab/CR) được thêm dấu ' phía trước để Excel/Sheets không coi là
 * công thức (CSV injection) — caption tweet do người khác viết, không tin được.
 */
export function csvCell(value: unknown): string {
  let text = value === undefined || value === null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
