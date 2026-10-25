// Bảng giá HTML trên trang chủ (thay ảnh bảng giá tĩnh).
// Giá hiển thị = sellPrice(product) – cùng nguồn với thẻ sản phẩm và đơn hàng.
import { esc, money, toast, SHOP } from './common.js';
import { sellPrice } from './pricing.js';

const row = (p) => {
  const hot = p.badge && /đặc biệt/i.test(p.badge);
  return `
    <li class="pb-row${hot ? ' pb-hot' : ''}">
      <div class="pb-name">
        <span class="pb-title">${esc(p.name)}${p.badge ? ` <span class="pb-badge">${esc(p.badge)}</span>` : ''}</span>
        ${p.description ? `<span class="pb-desc">${esc(p.description)}</span>` : ''}
      </div>
      <span class="pb-dots" aria-hidden="true"></span>
      <span class="pb-price">${esc(money(sellPrice(p)))}<small>/${esc(p.unit || 'kg')}</small></span>
    </li>`;
};

export function renderPriceBoard(el, products = []) {
  if (!el) return;
  const list = products.filter((p) => p.active !== false);
  // Ngày áp dụng = lần đổi giá gần nhất (products.price_updated_at); thiếu thì lấy hôm nay
  const stamps = list.map((p) => Date.parse(p.price_updated_at)).filter(Number.isFinite);
  const sinceDate = new Date(stamps.length ? Math.max(...stamps) : Date.now());
  const since = sinceDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  el.dataset.since = since.split('/').reverse().join('-'); // yyyy-mm-dd, dùng đặt tên file ảnh
  el.innerHTML = `
    <div class="pb-head">
      <p class="pb-kicker">Cua Năm Căn · Đầm Dơi</p>
      <h3 class="pb-heading"><em>Bảng giá</em> cua sống</h3>
      <p class="pb-sub">Cua dây rút · cân đủ ký · bao đổi trả</p>
    </div>
    ${list.length
      ? `<ul class="pb-list">${list.map(row).join('')}</ul>`
      : '<p class="pb-empty">Chưa có giá hôm nay, Anh/Chị nhắn Zalo để được báo giá.</p>'}
    <div class="pb-foot">
      <ul class="pb-perks">
        <li><b>Cua dây rút</b>Cân đủ ký</li>
        <li><b>Freeship đơn đầu</b>Sau đó tính theo GreenSM</li>
        <li><b>Bao đổi trả</b>Cua chết, rụng càng</li>
      </ul>
      <p class="pb-bulk">Khách có nhu cầu mua <b>số lượng lớn (≥&nbsp;10kg)</b> vui lòng inbox để lấy giá tốt.</p>
      <p class="pb-call">Đặt hàng qua Zalo / điện thoại</p>
      <a class="pb-phone" href="tel:${esc(SHOP.phone)}">${esc(SHOP.phoneDisplay)}</a>
      <p class="pb-date">Giá áp dụng từ ${since} · có thể thay đổi theo con nước</p>
    </div>`;
  el.removeAttribute('aria-busy');
}

/* ---------------- Tải ảnh bảng giá (PNG) ---------------- */
// html2canvas chỉ tải khi khách bấm nút, không làm chậm trang chủ.
const H2C_URL = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
let h2cLoading = null;
function loadHtml2canvas() {
  if (window.html2canvas) return Promise.resolve(window.html2canvas);
  h2cLoading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = H2C_URL;
    s.async = true;
    s.onload = () => (window.html2canvas ? resolve(window.html2canvas) : reject(new Error('html2canvas')));
    s.onerror = () => { h2cLoading = null; s.remove(); reject(new Error('Không tải được thư viện tạo ảnh')); };
    document.head.append(s);
  });
  return h2cLoading;
}

// Chụp bảng giá ở khổ cố định 620px (giống bản máy tính) để ảnh luôn đẹp, kể cả khi bấm trên điện thoại
export async function priceBoardBlob(board) {
  const html2canvas = await loadHtml2canvas();
  try { await document.fonts?.ready; } catch { /* bỏ qua */ }
  // html2canvas vẽ sai viền trang trí ::before và nhãn inline-block → lớp .pb-capture chỉnh tạm khi chụp
  board.classList.add('pb-capture');
  const canvas = await html2canvas(board, {
    scale: 2,
    backgroundColor: '#ffffff',
    logging: false,
    windowWidth: 1024,
    onclone: (doc) => {
      const b = doc.getElementById(board.id);
      if (b) Object.assign(b.style, { width: '620px', maxWidth: '620px', margin: '0', boxShadow: 'none' });
    },
  }).finally(() => board.classList.remove('pb-capture'));
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Không tạo được ảnh'))), 'image/png'));
}

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function initPriceDownload(btn, board) {
  if (!btn || !board || btn.dataset.bound) return;
  btn.dataset.bound = '1';
  btn.disabled = false;
  const label = btn.innerHTML;
  btn.addEventListener('click', async () => {
    if (btn.disabled) return;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.textContent = 'Đang tạo ảnh…';
    try {
      const blob = await priceBoardBlob(board);
      const name = `bang-gia-cua-co-thuy-${board.dataset.since || 'hom-nay'}.png`;
      const file = typeof File === 'function' ? new File([blob], name, { type: 'image/png' }) : null;
      // Điện thoại: mở bảng chia sẻ để "Lưu ảnh" vào thư viện / gửi Zalo; không được thì tải file
      const touch = window.matchMedia?.('(pointer: coarse)').matches;
      let shared = false;
      if (touch && file && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'Bảng giá Cua Cô Thúy' });
          shared = true;
        } catch (err) {
          if (err?.name === 'AbortError') shared = true; // khách tự đóng bảng chia sẻ
        }
      }
      if (!shared) { saveBlob(blob, name); toast('Đã tải ảnh bảng giá'); }
    } catch (err) {
      console.error(err);
      toast('Chưa tải được ảnh bảng giá, Anh/Chị thử lại hoặc chụp màn hình giúp nhé.', true);
    } finally {
      btn.innerHTML = label;
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
    }
  });
}
