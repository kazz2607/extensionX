/**
 * zip-store.ts — bộ ghi ZIP tối giản (phương thức STORE, không nén).
 *
 * Thay JSZip (~96 KB): ZIP chỉ dùng để gói ảnh/video tải từ X — JPEG, PNG,
 * WebP, MP4, GIF đã nén sẵn nên DEFLATE gần như không giảm dung lượng mà tốn
 * CPU. Mỗi phần ZIP tối đa 500 MB (offscreen.ts), dưới giới hạn 4 GB của ZIP
 * thường nên không cần ZIP64. Tên file được làm sạch ở nơi gọi; vẫn đánh dấu
 * UTF-8 (cờ bit 11) cho chắc.
 */

export interface ZipEntry {
  name: string;
  data: Uint8Array<ArrayBuffer>;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Ngày giờ kiểu MS-DOS (độ phân giải 2 giây, từ năm 1980). */
function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

const UTF8_FLAG = 0x0800;
const VERSION_STORE = 10;

/** Tạo các phần (header + dữ liệu + central directory) của một file ZIP STORE. */
export function buildStoredZip(entries: readonly ZipEntry[], now = new Date()): Uint8Array<ArrayBuffer>[] {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(now);
  const parts: Uint8Array<ArrayBuffer>[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, VERSION_STORE, true);
    lv.setUint16(6, UTF8_FLAG, true);
    lv.setUint16(8, 0, true); // STORE
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);
    parts.push(local, entry.data);

    const header = new Uint8Array(46 + name.length);
    const cv = new DataView(header.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, VERSION_STORE, true);
    cv.setUint16(6, VERSION_STORE, true);
    cv.setUint16(8, UTF8_FLAG, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    // extra/comment length, disk start, internal/external attributes = 0
    cv.setUint32(42, offset, true);
    header.set(name, 46);
    central.push(header);

    offset += local.length + size;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  return [...parts, ...central, end];
}

export type ZipPartDecision = 'add' | 'flush' | 'skip';

/**
 * Quyết định cho file kế tiếp khi gom vào các phần ZIP: thêm vào phần đang mở,
 * đóng phần đang mở rồi thêm vào phần mới ('flush'), hoặc bỏ qua vì một mình
 * file đã vượt giới hạn byte. Trước 8.2.3 vượt giới hạn là dừng cả phần, các
 * file còn lại không vào ZIP nào.
 */
export function zipPartDecision(partBytes: number, partFiles: number, size: number, maxBytes: number, maxFiles: number): ZipPartDecision {
  if (size > maxBytes) return 'skip';
  if (partFiles === 0) return 'add';
  if (partFiles >= maxFiles || partBytes + size > maxBytes) return 'flush';
  return 'add';
}

const SAFE_EXT = /^[a-z0-9]{1,5}$/i;

/**
 * Tên entry trong ZIP: phần cuối của URL + đuôi theo loại media. URL ảnh dạng
 * `…/media/ABC?format=jpg&name=orig` không có đuôi trong path; tên trùng trong
 * cùng một ZIP được đánh số để không entry nào bị giải nén đè.
 */
export function zipEntryName(url: string, ext: string | undefined, index: number, used: Set<string>): string {
  let path = '';
  try { path = new URL(url).pathname; } catch { /* dùng tên dự phòng */ }
  const last = path.split('/').pop() || '';
  const dot = last.lastIndexOf('.');
  const hasExt = dot > 0 && SAFE_EXT.test(last.slice(dot + 1));
  const base = ((hasExt ? last.slice(0, dot) : last).replace(/[^A-Za-z0-9_-]/g, '_') || `media_${index}`).slice(-100);
  const formatParam = (() => { try { return new URL(url).searchParams.get('format') || ''; } catch { return ''; } })();
  // `format=` của CDN phản ánh định dạng thật; `ext` của item có thể là 'jpg' mặc định.
  const extension = [hasExt ? last.slice(dot + 1) : '', formatParam, ext || ''].find((value) => SAFE_EXT.test(value))?.toLowerCase() || 'bin';
  let name = `${base}.${extension}`;
  for (let n = 2; used.has(name); n++) name = `${base}_${n}.${extension}`;
  used.add(name);
  return name;
}
