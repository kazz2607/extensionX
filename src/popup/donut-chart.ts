/**
 * donut-chart.ts — Donut chart thống kê Images/Videos/GIFs/HLS (Pha 8 refactor).
 * Tách nguyên vẹn từ popup.ts, không đổi hành vi: hàm pure nhận `stats` hiện
 * tại làm tham số, tự query DOM của mình, cập nhật attribute SVG trực tiếp
 * (không rebuild toàn bộ) theo tối ưu đã có từ Pha 3.
 */
import type { Stats } from '../types.ts';

export function renderDonutChart(stats: Stats): void {
  const arcs = document.getElementById('donut-arcs');
  const totalEl = document.getElementById('donut-total-num');
  if (!arcs || !totalEl) return;

  const legendImages = document.getElementById('legend-images');
  const legendVideos = document.getElementById('legend-videos');
  const legendGifs = document.getElementById('legend-gifs');
  const legendHls = document.getElementById('legend-hls');

  const data = [
    { key: 'image', color: '#1D9BF0', label: 'Images', val: stats.image || 0 },
    { key: 'video', color: '#a855f7', label: 'Videos', val: (stats.video || 0) + (stats.hls || 0) },
    { key: 'gif', color: '#00ba7c', label: 'GIFs', val: stats.gif || 0 },
    { key: 'hls', color: '#ff7a00', label: 'HLS', val: 0 }, // merged into video
  ];

  // Merge HLS into video (already done above), show separate HLS legend
  const hlsOnly = stats.hls || 0;
  if (legendHls) legendHls.textContent = String(hlsOnly);

  const total = (stats.image || 0) + (stats.video || 0) + (stats.gif || 0) + (stats.hls || 0);
  totalEl.textContent = total > 9999 ? '9k+' : String(total);

  if (legendImages) legendImages.textContent = String(stats.image || 0);
  if (legendVideos) legendVideos.textContent = String((stats.video || 0) + (stats.hls || 0));
  if (legendGifs) legendGifs.textContent = String(stats.gif || 0);

  if (total === 0) {
    // P3: Update incremental — chỉ set attribute không dùng innerHTML
    const existing = Array.from(arcs.querySelectorAll<SVGCircleElement>('circle'));
    if (existing.length === 1 && existing[0].getAttribute('stroke') === 'var(--border)') {
      // Đã đúng, không cần thay đổi
    } else {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle') as SVGCircleElement;
      c.setAttribute('cx', '50'); c.setAttribute('cy', '50'); c.setAttribute('r', '38');
      c.setAttribute('fill', 'none'); c.setAttribute('stroke', 'var(--border)'); c.setAttribute('stroke-width', '12');
      arcs.replaceChildren(c);
    }
    return;
  }

  // P3: Draw arcs — reuse các circle node hiện có nếu có thể, chỉ tạo mới khi cần
  const r = 38;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const activeSegments = data.filter((d) => d.val > 0);
  const existingCircles = Array.from(arcs.querySelectorAll<SVGCircleElement>('circle'));

  // Điều chỉnh số lượng circle với số segment
  while (existingCircles.length > activeSegments.length) existingCircles.pop()!.remove();
  while (existingCircles.length < activeSegments.length) {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle') as SVGCircleElement;
    c.setAttribute('cx', '50'); c.setAttribute('cy', '50'); c.setAttribute('r', String(r));
    c.setAttribute('fill', 'none'); c.setAttribute('stroke-width', '12');
    c.style.transition = 'stroke-dasharray 0.5s ease';
    c.style.transformOrigin = '50% 50%';
    arcs.appendChild(c);
    existingCircles.push(c);
  }

  activeSegments.forEach((seg, i) => {
    const frac = seg.val / total;
    const dash = frac * circ;
    const gap = circ - dash;
    existingCircles[i].setAttribute('stroke', seg.color);
    existingCircles[i].setAttribute('stroke-dasharray', `${dash.toFixed(2)} ${gap.toFixed(2)}`);
    existingCircles[i].setAttribute('stroke-dashoffset', `${(-offset * circ / 360).toFixed(2)}`);
    offset += frac * 360;
  });
}
