import { SUPABASE_URL, SUPABASE_ANON_KEY, SHOP } from './config.js';

export { SHOP };

const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

// false khi js/config.js vẫn còn giá trị mẫu (YOUR-PROJECT / YOUR-ANON-KEY)
export const configured = Boolean(
  SUPABASE_URL && SUPABASE_ANON_KEY &&
  !/YOUR-PROJECT/i.test(SUPABASE_URL) && !/YOUR-ANON-KEY/i.test(SUPABASE_ANON_KEY)
);

// Chỉ tải supabase-js khi đã cấu hình. Khi chưa cấu hình hoặc CDN lỗi: sb = null
// (các hàm bên dưới đều kiểm tra sb trước khi dùng).
export let sb = null;
if (configured) {
  try {
    const { createClient } = await import(SUPABASE_JS);
    sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (err) {
    console.error('Không tải được Supabase:', err);
  }
}

// Bảng giá mặc định (id 1..6 khớp thứ tự seed trong supabase/schema.sql)
export const FALLBACK_PRODUCTS = Object.freeze([
  { id: 1, name: 'Cua don',  description: '5–6 con/kg',               price: 240000, unit: 'kg', badge: null,       sort: 1, active: true },
  { id: 2, name: 'Cua tứ',   description: '4 con/kg',                 price: 340000, unit: 'kg', badge: null,       sort: 2, active: true },
  { id: 3, name: 'Cua Y3',   description: 'Khoảng 3 lạng/con',        price: 410000, unit: 'kg', badge: null,       sort: 3, active: true },
  { id: 4, name: 'Cua Y5',   description: 'Khoảng 5 lạng/con',        price: 590000, unit: 'kg', badge: null,       sort: 4, active: true },
  { id: 5, name: 'Cua Y7',   description: 'Từ 7 lạng/con trở lên',    price: 690000, unit: 'kg', badge: 'Cao cấp',  sort: 5, active: true },
  { id: 6, name: 'Cua gạch', description: '3–4 con/kg · gạch son đỏ', price: 600000, unit: 'kg', badge: 'Đặc biệt', sort: 6, active: true },
].map((p) => Object.freeze(p)));

export const PAYMENT_METHOD = { cod: 'COD (trả khi nhận hàng)', chuyen_khoan: 'Chuyển khoản' };
export const PAYMENT_STATUS = { chua_thu: 'Chưa thu', da_thu: 'Đã thu' };

export const STATUS = {
  moi: 'Mới',
  xac_nhan: 'Đã xác nhận',
  dang_giao: 'Đang giao',
  da_giao: 'Đã giao',
  huy: 'Đã hủy',
};

// Luôn escape dữ liệu người dùng trước khi chèn vào HTML
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const money = (n) => Number(n || 0).toLocaleString('vi-VN') + 'đ';
export const when = (t) => new Date(t).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
export const $ = (sel, root = document) => (root ? root.querySelector(sel) : null);

export function toast(msg, isError = false) {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.append(el);
  }
  el.textContent = msg;
  el.className = 'show' + (isError ? ' err' : '');
  clearTimeout(el._t);
  el._t = setTimeout(() => (el.className = ''), 3500);
}

export async function currentProfile() {
  if (!sb) return null;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const { data, error } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
  if (error) { toast(error.message, true); return null; }
  return { ...data, email: session.user.email };
}

// Trả danh sách sản phẩm đang bán. Chưa cấu hình / lỗi mạng / bảng rỗng → FALLBACK_PRODUCTS.
// silent: true để không hiện toast lỗi (trang chủ).
export async function loadProducts({ silent = false } = {}) {
  if (!sb) return FALLBACK_PRODUCTS.map((p) => ({ ...p }));
  try {
    const { data, error } = await sb.from('products').select('*').eq('active', true).order('sort');
    if (error) throw error;
    if (Array.isArray(data) && data.length) return data;
  } catch (err) {
    if (!silent) toast(err?.message || 'Không tải được sản phẩm', true);
    else console.warn('loadProducts:', err);
  }
  return FALLBACK_PRODUCTS.map((p) => ({ ...p }));
}

// Menu mobile: button.nav-toggle[aria-controls] bật/tắt class "open" trên nav#mainNav.
// Đóng khi bấm link trong menu, bấm Esc hoặc bấm ra ngoài. An toàn khi thiếu phần tử.
export function initNav() {
  const btn = $('.nav-toggle');
  const nav = (btn && document.getElementById(btn.getAttribute('aria-controls') || '')) || $('#mainNav');
  if (!btn || !nav || btn._navInit) return;
  btn._navInit = true;
  const set = (open) => {
    nav.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Đóng menu' : 'Mở menu');
  };
  set(nav.classList.contains('open'));
  btn.addEventListener('click', () => set(!nav.classList.contains('open')));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('open')) { set(false); btn.focus(); }
  });
  document.addEventListener('click', (e) => {
    if (nav.classList.contains('open') && !nav.contains(e.target) && !btn.contains(e.target)) set(false);
  });

  // Màn rộng nhưng menu dài hơn chỗ chứa (đã đăng nhập thêm vài mục) → gọn thành nút ☰ thay vì tràn
  const header = nav.closest('.site-header');
  const row = nav.parentElement;
  if (!header || !row) return;
  const fit = () => {
    header.classList.remove('nav-compact');
    if (matchMedia('(min-width:961px)').matches && row.scrollWidth > row.clientWidth + 1) {
      header.classList.add('nav-compact');
    }
  };
  window.addEventListener('resize', fit);
  window.addEventListener('nav:changed', fit);
  document.fonts?.ready.then(fit);
  fit();
}

// Gán link Zalo / điện thoại từ SHOP cho các phần tử có sẵn trong trang
export function applyShopLinks(root = document) {
  root.querySelectorAll('#zaloBtn, #zaloFloat, #topZalo, .ab-zalo, [data-zalo]').forEach((a) => {
    a.href = SHOP.zalo;
    if (!a.target) { a.target = '_blank'; a.rel = 'noopener'; }
  });
  root.querySelectorAll('#topPhone, .ab-call, [data-tel]').forEach((a) => { a.href = `tel:${SHOP.phone}`; });
  root.querySelectorAll('[data-phone-text]').forEach((el) => { el.textContent = SHOP.phoneDisplay; });
}

// Form đăng nhập / đăng ký dùng chung cho khách và nhân viên
export function renderAuth(root, onDone) {
  if (!root) return;
  if (!sb) {
    root.innerHTML = `
      <div class="card narrow">
        <h3>Hệ thống đang được cài đặt</h3>
        <p class="muted">Chưa kết nối máy chủ (js/config.js). Vui lòng nhắn Zalo
          <a href="${esc(SHOP.zalo)}" target="_blank" rel="noopener">${esc(SHOP.phoneDisplay)}</a>.</p>
      </div>`;
    return;
  }
  root.innerHTML = `
    <div class="card narrow">
      <div class="tabs"><button type="button" data-m="in" class="on">Đăng nhập</button><button type="button" data-m="up">Đăng ký</button></div>
      <form id="authForm">
        <div class="up-only hidden">
          <label>Họ tên<input name="full_name" autocomplete="name"></label>
          <label>Số điện thoại<input name="phone" inputmode="tel" autocomplete="tel"></label>
        </div>
        <label>Email<input name="email" type="email" required autocomplete="email"></label>
        <label>Mật khẩu<input name="password" type="password" minlength="6" required autocomplete="current-password"></label>
        <button class="btn btn-red primary" type="submit">Đăng nhập</button>
      </form>
    </div>`;
  let mode = 'in';
  const form = $('#authForm', root);
  root.querySelectorAll('.tabs button').forEach((b) => b.onclick = () => {
    mode = b.dataset.m;
    root.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
    $('.up-only', root).classList.toggle('hidden', mode === 'in');
    $('button[type=submit]', form).textContent = mode === 'in' ? 'Đăng nhập' : 'Tạo tài khoản';
    form.password.autocomplete = mode === 'in' ? 'current-password' : 'new-password';
  });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const btn = $('button[type=submit]', form);
    btn.disabled = true;
    let res;
    try {
      res = mode === 'in'
        ? await sb.auth.signInWithPassword({ email: f.email, password: f.password })
        : await sb.auth.signUp({ email: f.email, password: f.password,
            options: { data: { full_name: f.full_name, phone: f.phone } } });
    } catch (err) {
      res = { error: err };
    }
    btn.disabled = false;
    if (res.error) return toast(res.error.message || 'Lỗi kết nối', true);
    if (mode === 'up' && !res.data.session) return toast('Kiểm tra email để xác nhận tài khoản.');
    onDone();
  };
}

// Menu theo vai trò, gắn vào nav#mainNav.
// - login: true (trang chủ): thêm nút "Đăng nhập" mở hộp thoại; đã đăng nhập thì hiện
//   "Đăng xuất". login: false (trang tài khoản, đã có form và nút đăng xuất riêng).
// - Nhân viên/admin luôn thấy thêm nút "Quản lý đơn". Chỉ để điều hướng; quyền thật do RLS.
export async function initAccountNav({ login = true } = {}) {
  const nav = $('#mainNav');
  if (!nav || !sb || $('#acctNav')) return;
  const slot = document.createElement('span');
  slot.id = 'acctNav';
  slot.className = 'acct-nav';
  nav.append(slot);

  const render = (me) => {
    const staff = me && ['staff', 'admin'].includes(me.role);
    slot.innerHTML =
      (staff ? '<a href="quan-ly.html" class="staff-link">Quản lý đơn</a>' : '') +
      (login ? (me
        ? `<a href="#" data-acct="logout"${me.full_name ? ' title="Đang đăng nhập: ' + esc(me.full_name) + '"' : ''}>Đăng xuất</a>`
        : '<a href="#" data-acct="login">Đăng nhập</a>') : '');
    window.dispatchEvent(new Event('nav:changed'));
  };
  const refresh = async () => {
    let me = null;
    try { me = await currentProfile(); } catch (err) { console.error(err); }
    render(me);
  };

  slot.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-acct]');
    if (!a) return;
    e.preventDefault();
    if (a.dataset.acct === 'login') return openLoginDialog(refresh);
    try { await sb.auth.signOut(); } catch { /* bỏ qua */ }
    render(null);
  });
  await refresh();
}

function openLoginDialog(onDone) {
  let d = $('#loginDialog');
  if (!d) {
    d = document.createElement('dialog');
    d.id = 'loginDialog';
    d.className = 'login-dialog';
    d.innerHTML = '<button type="button" class="dlg-close" aria-label="Đóng">×</button><div class="dlg-body"></div>';
    document.body.append(d);
    $('.dlg-close', d).onclick = () => d.close();
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  }
  renderAuth($('.dlg-body', d), () => { d.close(); onDone(); });
  d.showModal();
}

// Hộp thoại chọn hình thức thanh toán. Trả về 'cod' | 'chuyen_khoan', hoặc null nếu đóng/hủy.
export function askPayment({ total = 0, phone = '' } = {}) {
  return new Promise((resolve) => {
    const b = SHOP.bank || {};
    const bank = b.account
      ? `<p>${b.name ? esc(b.name) + '<br>' : ''}Số tài khoản: <b>${esc(b.account)}</b>${b.holder ? '<br>Chủ tài khoản: <b>' + esc(b.holder) + '</b>' : ''}<br>Nội dung: <b>${esc(phone || 'SĐT đặt hàng')}</b><br>Số tiền: <b>${esc(money(total))}</b></p>`
      : `<p>Shop sẽ nhắn số tài khoản qua Zalo hoặc điện thoại ${esc(SHOP.phoneDisplay)} sau khi nhận đơn.</p>`;
    const d = document.createElement('dialog');
    d.className = 'login-dialog pay-dialog';
    d.innerHTML = `
      <button type="button" class="dlg-close" aria-label="Đóng">×</button>
      <form class="dlg-body" method="dialog">
        <h3>Hình thức thanh toán</h3>
        <p class="muted">Tổng tiền tạm tính: <b>${esc(money(total))}</b></p>
        <label class="pay-opt"><input type="radio" name="pm" value="cod" checked>
          <span><b>COD</b><br><span class="muted">Trả tiền mặt khi nhận hàng</span></span></label>
        <label class="pay-opt"><input type="radio" name="pm" value="chuyen_khoan">
          <span><b>Chuyển khoản</b><br><span class="muted">Chuyển trước hoặc khi nhận hàng</span></span></label>
        <div class="pay-bank hidden">${bank}</div>
        <div class="row" style="justify-content:flex-end;margin-top:12px">
          <button type="button" class="btn small" data-act="cancel">Quay lại</button>
          <button type="submit" class="btn btn-red primary">Xác nhận đặt hàng</button>
        </div>
      </form>`;
    document.body.append(d);
    let result = null;
    const form = $('form', d);
    form.onchange = () => $('.pay-bank', d).classList.toggle('hidden', form.pm.value !== 'chuyen_khoan');
    form.onsubmit = () => { result = form.pm.value; };
    $('.dlg-close', d).onclick = () => d.close();
    $('[data-act=cancel]', d).onclick = () => d.close();
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    d.addEventListener('close', () => { d.remove(); resolve(result); });
    d.showModal();
  });
}
