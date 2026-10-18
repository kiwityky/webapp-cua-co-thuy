// Trang chủ: sản phẩm + giỏ hàng, tab danh mục, menu mobile, thư viện ảnh + lightbox.
// Mọi thao tác DOM đều kiểm tra phần tử tồn tại.
import { esc, money, toast, loadProducts, initNav, applyShopLinks, initAccountNav } from './common.js';
import * as cart from './cart.js';

// images.js do Tác vụ 2 tạo; nếu thiếu, trang vẫn chạy (không ảnh)
let IMG = { IMAGES: {}, PRODUCT_IMAGES: {}, GALLERY: [], picture: () => '', imgUrl: () => '' };
try {
  IMG = { ...IMG, ...(await import('./images.js')) };
} catch (err) {
  console.warn('Không tải được js/images.js:', err);
}

const byId = (id) => document.getElementById(id);
let products = [];

/* ---------------- Sản phẩm ---------------- */
function skeleton(n = 6) {
  return Array.from({ length: n }, () => `
    <article class="product-card skeleton" aria-hidden="true">
      <div class="product-media"></div>
      <div class="product-body"><h3>&nbsp;</h3><p class="desc">&nbsp;</p>
        <div class="price-row"><span class="price">&nbsp;</span></div></div>
    </article>`).join('');
}

function productCard(p) {
  const imgName = IMG.PRODUCT_IMAGES?.[p.name];
  let media = '';
  if (imgName && IMG.IMAGES?.[imgName]) {
    try {
      media = IMG.picture(imgName, { sizes: '(max-width:600px) 100vw, (max-width:960px) 50vw, 360px' }) || '';
    } catch { media = ''; }
  }
  return `
    <article class="product-card" data-id="${esc(p.id)}">
      <div class="product-media">${media}${p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ''}</div>
      <div class="product-body">
        <h3>${esc(p.name)}</h3>
        <p class="desc">${esc(p.description)}</p>
        <div class="price-row">
          <span class="price">${esc(money(p.price))}</span><small class="unit">/${esc(p.unit || 'kg')}</small>
        </div>
        <button type="button" class="btn btn-red add-cart" data-id="${esc(p.id)}"
          aria-label="Thêm 1 ${esc(p.unit || 'kg')} ${esc(p.name)} vào giỏ">Thêm vào giỏ</button>
      </div>
    </article>`;
}

async function initProducts() {
  const grid = byId('products');
  if (!grid) return;
  grid.setAttribute('aria-busy', 'true');
  grid.innerHTML = skeleton();
  try {
    products = await loadProducts({ silent: true });
  } catch {
    products = [];
  }
  grid.innerHTML = products.length
    ? products.map(productCard).join('')
    : '<p class="muted">Xem bảng giá trong ảnh bên dưới hoặc nhắn Zalo.</p>';
  grid.removeAttribute('aria-busy');

  const note = byId('priceNote');
  if (note && !note.textContent.trim()) {
    note.textContent = 'Giá tính theo kg, có thể thay đổi theo con nước – nhắn Zalo để được báo giá hôm nay.';
  }

  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('.add-cart');
    if (!btn || !grid.contains(btn)) return;
    const p = products.find((x) => String(x.id) === btn.dataset.id);
    if (!p) return;
    cart.add(p, 1);
    const line = cart.get().find((i) => i.product_id === Number(p.id));
    toast(`Đã thêm 1 ${p.unit || 'kg'} ${p.name} vào giỏ${line ? ` (tổng ${line.quantity} ${line.unit})` : ''}`);
  });
}

/* ---------------- Tab Cua sống / Món chế biến ---------------- */
function initTabs() {
  const tabs = [...document.querySelectorAll('.cat-tab[data-cat]')];
  if (!tabs.length) return;
  const list = tabs[0].closest('[role=tablist]');

  const select = (cat, focus = false) => {
    const tab = tabs.find((t) => t.dataset.cat === cat);
    if (!tab) return;
    tabs.forEach((t) => {
      const on = t === tab;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      const panel = byId(`panel-${t.dataset.cat}`);
      if (panel) panel.hidden = !on;
    });
    if (focus) tab.focus();
  };

  tabs.forEach((t) => {
    t.setAttribute('role', 'tab');
    const panel = byId(`panel-${t.dataset.cat}`);
    if (panel) {
      if (!t.id) t.id = `tab-${t.dataset.cat}`;
      t.setAttribute('aria-controls', panel.id);
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', t.id);
    }
    t.addEventListener('click', () => select(t.dataset.cat));
  });

  (list || tabs[0].parentElement)?.addEventListener('keydown', (e) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    let j = null;
    if (e.key === 'ArrowRight') j = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = tabs.length - 1;
    if (j === null) return;
    e.preventDefault();
    select(tabs[j].dataset.cat, true);
  });

  // Link nav có data-cat (vd. "Món chế biến") → chuyển tab, để anchor #san-pham tự cuộn
  document.querySelectorAll('a[data-cat]').forEach((a) =>
    a.addEventListener('click', () => select(a.dataset.cat)));

  const initial = tabs.find((t) => t.classList.contains('active')) || tabs[0];
  select(initial.dataset.cat);
}

/* ---------------- Thư viện ảnh + lightbox ---------------- */
function initGallery() {
  const gal = byId('gallery');
  const names = (IMG.GALLERY || []).filter((n) => IMG.IMAGES?.[n]);
  if (!gal || !names.length) return;

  gal.innerHTML = names.map((n) => {
    let pic = '';
    try { pic = IMG.picture(n, { sizes: '(max-width:600px) 50vw, (max-width:960px) 33vw, 320px' }) || ''; } catch { /* bỏ qua */ }
    return `<button type="button" class="gallery-item" data-name="${esc(n)}"
      aria-label="Xem ảnh lớn: ${esc(IMG.IMAGES[n].alt || '')}">${pic}</button>`;
  }).join('');

  const dlg = byId('lightbox');
  if (!dlg) return;
  let img = dlg.querySelector('img');
  if (!img) { img = document.createElement('img'); dlg.prepend(img); }
  img.decoding = 'async';

  const mkBtn = (cls, label, text) => {
    let b = dlg.querySelector(`.${cls}`);
    if (!b) {
      b = document.createElement('button');
      b.type = 'button';
      b.className = cls;
      b.setAttribute('aria-label', label);
      b.textContent = text;
      dlg.append(b);
    }
    return b;
  };
  const closeBtn = mkBtn('lb-close', 'Đóng', '×');
  const prevBtn = names.length > 1 ? mkBtn('lb-prev', 'Ảnh trước', '‹') : null;
  const nextBtn = names.length > 1 ? mkBtn('lb-next', 'Ảnh sau', '›') : null;
  if (!dlg.getAttribute('aria-label')) dlg.setAttribute('aria-label', 'Xem ảnh');

  let idx = 0, opener = null;
  const show = (i) => {
    idx = (i + names.length) % names.length;
    const n = names[idx];
    img.src = IMG.imgUrl(n, 960, 'webp');
    img.alt = IMG.IMAGES[n]?.alt || '';
    if (IMG.IMAGES[n]?.w) { img.width = IMG.IMAGES[n].w; img.height = IMG.IMAGES[n].h; }
    // tải trước ảnh kế tiếp
    if (names.length > 1) { const pre = new Image(); pre.src = IMG.imgUrl(names[(idx + 1) % names.length], 960, 'webp'); }
  };
  const open = (i, from) => {
    opener = from || null;
    show(i);
    try {
      if (typeof dlg.showModal === 'function') { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute('open', '');
    } catch { dlg.setAttribute('open', ''); }
    closeBtn.focus();
  };
  const close = () => {
    if (typeof dlg.close === 'function' && dlg.open) dlg.close(); else dlg.removeAttribute('open');
  };
  dlg.addEventListener('close', () => { opener?.focus?.(); });

  gal.addEventListener('click', (e) => {
    const b = e.target.closest('.gallery-item');
    if (b) open(names.indexOf(b.dataset.name), b);
  });
  closeBtn.addEventListener('click', close);
  prevBtn?.addEventListener('click', () => show(idx - 1));
  nextBtn?.addEventListener('click', () => show(idx + 1));
  // bấm nền (vùng ngoài ảnh/nút) → đóng
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); show(idx + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); show(idx - 1); }
    else if (e.key === 'Escape' && !(typeof dlg.showModal === 'function')) close();
  });
  // vuốt trái/phải trên mobile
  let x0 = null, y0 = null;
  dlg.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; x0 = t.clientX; y0 = t.clientY; }, { passive: true });
  dlg.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
    x0 = y0 = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) show(idx + (dx < 0 ? 1 : -1));
  }, { passive: true });
}

/* ---------------- Khởi động ---------------- */
function safe(fn) { try { fn(); } catch (err) { console.error(err); } }

safe(applyShopLinks);
safe(initNav);
safe(initAccountNav);
safe(() => cart.bindCount());
safe(initTabs);
safe(initGallery);
initProducts().catch((err) => console.error(err));
