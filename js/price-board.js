// Bảng giá HTML trên trang chủ (thay ảnh bảng giá tĩnh).
// Giá hiển thị = sellPrice(product) – cùng nguồn với thẻ sản phẩm và đơn hàng.
import { esc, money, SHOP } from './common.js';
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
  const since = new Date(stamps.length ? Math.max(...stamps) : Date.now())
    .toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
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
      <p class="pb-call">Đặt hàng qua Zalo / điện thoại</p>
      <a class="pb-phone" href="tel:${esc(SHOP.phone)}">${esc(SHOP.phoneDisplay)}</a>
      <p class="pb-date">Giá áp dụng từ ${since} · có thể thay đổi theo con nước</p>
    </div>`;
  el.removeAttribute('aria-busy');
}
