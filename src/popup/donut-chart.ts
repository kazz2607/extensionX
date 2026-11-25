/**
 * donut-chart.ts — Donut chart thống kê Images/Videos/GIFs/HLS (Pha 8 refactor).
 * Tách nguyên vẹn từ popup.ts, không đổi hành vi: hàm pure nhận `stats` hiện
 * tại làm tham số, tự query DOM của mình, cập nhật attribute SVG trực tiếp
 * (không rebuild toàn bộ) theo tối ưu đã có từ Pha 3.
 */
import type { Stats } from '../types.ts';
import { formatNumber, t } from '../lib/i18n.ts';

export function renderDonutChart(stats: Stats): void {
  const arcs = document.getElementById('donut-arcs');
  const totalEl = document.getElementById('donut-total-num');
  if (!arcs || !totalEl) return;

  const legendImages = document.getElementById('legend-images');
  const legendVideos = document.getElementById('legend-videos');
  const legendGifs = document.getElementById('legend-gifs');
  const legendHls = document.getElementById('legend-hls');

  // U26: màu theo token CSS (--chart-*), gán qua style vì var() trong thuộc
  // tính SVG không được mọi trình duyệt hiểu.
  const images = stats.image || 0;
  const videos = (stats.video || 0) + (stats.hls || 0);
  const gifs = stats.gif || 0;
  const data = [
    { key: 'image', color: 'var(--chart-image)', val: images },
    { key: 'video', color: 'var(--chart-video)', val: videos },
    { key: 'gif', color: 'var(--chart-gif)', val: gifs },
  ];

  // HLS đã gộp vào video ở trên; chú giải HLS hiện riêng số HLS.
  if (legendHls) legendHls.textContent = formatNumber(stats.hls || 0);

  const total = images + videos + gifs;
  // U26: số gọn theo ngôn ngữ (25.000 → "25K"), trước đây mọi tổng > 9999 đều là "9k+".
  totalEl.textContent = total > 9999 ? formatNumber(total, { notation: 'compact', maximumFractionDigits: 1 }) : formatNumber(total);
  document.getElementById('donut-svg')?.setAttribute('aria-label', t('popup_chart_aria', { images: formatNumber(images), videos: formatNumber(videos), gifs: formatNumber(gifs) }));

  if (legendImages) legendImages.textContent = formatNumber(images);
  if (legendVideos) legendVideos.textContent = formatNumber(videos);
  if (legendGifs) legendGifs.textContent = formatNumber(gifs);

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
    existingCircles[i].style.stroke = seg.color;
    existingCircles[i].setAttribute('stroke-dasharray', `${dash.toFixed(2)} ${gap.toFixed(2)}`);
    existingCircles[i].setAttribute('stroke-dashoffset', `${(-offset * circ / 360).toFixed(2)}`);
    offset += frac * 360;
  });
}
