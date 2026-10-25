#!/usr/bin/env node
// Kiểm thử bảng giá: bảng giá HTML trang chủ + nút tải ảnh PNG, ảnh dự phòng cho sản phẩm mới,
// tab "Sản phẩm & giá" (giá vốn + % lãi, chọn ảnh) và sửa đơn giá trong đơn.
// Chạy: node tools/test/bang-gia.mjs   (từ thư mục webapp)
// Biến môi trường tuỳ chọn: OUT_DIR (mặc định ../webapp-test), CHROME_PATH,
// HTML2CANVAS (file html2canvas.min.js cục bộ; không có thì tải từ cdnjs), REAL_FONTS=1 (tải font Google thật).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const OUT = process.env.OUT_DIR || path.resolve(ROOT, '..', 'webapp-test');
fs.mkdirSync(OUT, { recursive: true });

function loadPlaywright() {
  const req = createRequire(import.meta.url);
  const cands = ['playwright', 'playwright-core',
    ...(process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean).flatMap((p) => [path.join(p, 'playwright'), path.join(p, 'playwright-core')])];
  try {
    const g = execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    cands.push(path.join(g, 'playwright'), path.join(g, 'playwright-core'));
  } catch {}
  for (const c of cands) { try { return req(c); } catch {} }
  throw new Error('Không tìm thấy playwright (đặt NODE_PATH=$(npm root -g)).');
}
function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    for (const d of fs.readdirSync(base).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse()) {
      const p = path.join(base, d, 'chrome-linux', 'chrome');
      if (fs.existsSync(p)) return p;
    }
  } catch {}
  return undefined;
}
const { chromium } = loadPlaywright();
function findHtml2canvas() {
  if (process.env.HTML2CANVAS) return process.env.HTML2CANVAS;
  try { return createRequire(import.meta.url).resolve('html2canvas/dist/html2canvas.min.js'); } catch { return null; }
}
const H2C_FILE = findHtml2canvas();

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json' };
function startServer() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/favicon.ico') { res.writeHead(204); return res.end(); }
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, path.normalize(p));
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); return res.end('404'); }
      res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(buf);
    });
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

// ---------- Dữ liệu giả ----------
const now = new Date();
const iso = (offsetMin) => new Date(now.getTime() + offsetMin * 60000).toISOString();
const item = (n, q, price) => ({ product_id: 1, product_name: n, quantity: q, unit: 'kg', unit_price: price });
const mkOrder = (id, status, extra = {}) => ({
  id, status, customer_name: 'Khách ' + id, phone: '09000000' + String(id).padStart(2, '0'), address: id + ' Đường Cua, Cà Mau',
  delivery_time: null, note: null, payment_method: 'cod', payment_status: 'chua_thu', customer_id: null, created_by: null,
  created_at: iso(-300 - id), updated_at: iso(-10), total: 240000 * 2, order_items: [item('Cua don', 2, 240000)],
  creator: { full_name: 'NV Test' }, editor: null, points_awarded: 0, member_id: null, delivered_at: null, ...extra,
});
const MEMBERS = [
  { id: 1, phone: '0912000001', full_name: 'Nguyễn Thị Hoa', address: '12 Lê Lợi, Cà Mau', note: 'Khách quen', user_id: 'u-1', points: 48, total_spent: 480000, order_count: 2, first_order_at: iso(-9000), last_order_at: iso(-30) },
  { id: 2, phone: '0912000002', full_name: 'Trần Văn Bình <b>', address: '5 Hai Bà Trưng', note: null, user_id: null, points: 24, total_spent: 240000, order_count: 1, first_order_at: iso(-4000), last_order_at: iso(-4000) },
  { id: 3, phone: '0912000003', full_name: 'Lê Minh', address: null, note: null, user_id: null, points: 0, total_spent: 0, order_count: 0, first_order_at: null, last_order_at: null },
];
const DATA = {
  orders: [
    mkOrder(11, 'moi'), mkOrder(12, 'moi', { delivery_time: 'sáng mai 7h' }), mkOrder(13, 'xac_nhan'),
    mkOrder(14, 'dang_giao'), mkOrder(15, 'huy'),
    mkOrder(21, 'da_giao', { phone: '0912000001', customer_name: 'Nguyễn Thị Hoa', points_awarded: 24, member_id: 1, delivered_at: iso(-30), total: 480000, order_items: [item('Cua Y3', 1, 410000), item('Cua don', 0.5, 140000)] }),
    mkOrder(22, 'da_giao', { phone: '0912000002', customer_name: 'Trần Văn Bình <b>', points_awarded: 24, member_id: 2, delivered_at: iso(-60), total: 240000 }),
    mkOrder(23, 'da_giao', { phone: '0912000001', customer_name: 'Nguyễn Thị Hoa', points_awarded: 24, member_id: 1, delivered_at: iso(-60 * 30), total: 240000 }),
  ],
  members: MEMBERS,
  products: [
    { id: 1, name: 'Cua don', description: '5–6 con/kg', price: 240000, unit: 'kg', badge: null, sort: 1, active: true, price_updated_at: '2026-10-20T03:00:00Z' },
    { id: 6, name: 'Cua gạch', description: '3–4 con/kg · gạch son đỏ', price: 600000, unit: 'kg', badge: 'Đặc biệt', sort: 6, active: true, price_updated_at: '2026-10-21T03:00:00Z', image: null },
    // Sản phẩm mới chưa có trong js/images.js
    { id: 7, name: 'Cua gạch nhỏ', description: '3-4 con/kg · gạch son đỏ', price: 690000, unit: 'kg', badge: 'Đặc biệt', sort: 7, active: true, price_updated_at: '2026-10-21T03:00:00Z', image: null },
    { id: 8, name: 'Cua cốm', description: 'Mùa cốm', price: 450000, unit: 'kg', badge: null, sort: 8, active: true, price_updated_at: '2026-10-21T03:00:00Z', image: null },
    { id: 9, name: 'Cua tứ', description: 'Ảnh hỏng', price: 340000, unit: 'kg', badge: null, sort: 9, active: true, price_updated_at: '2026-10-21T03:00:00Z', image: 'gach-vang' },
  ],
  product_costs: [{ product_id: 1, cost: 208000, markup_pct: 15 }, { product_id: 6, cost: 500000, markup_pct: 20 }],
  profiles: [{ id: 'staff-1', full_name: 'NV Test', role: 'staff' }],
};

// ---------- Stub supabase-js RIÊNG của bài thử này ----------
const STUB = `
const DATA = ${JSON.stringify(DATA)};
const calls = [];
window.__calls = calls;
window.__data = DATA;
const memberOf = (id) => DATA.members.find((m) => m.id === id) || null;
const clone = (x) => JSON.parse(JSON.stringify(x));
class Q {
  constructor(t) { this.t = t; this.f = []; this.op = 'select'; this.patch = null; this.cols = ''; this.ord = null; this.lim = null; this.one = false; }
  select(c) { if (this.op === 'select') this.cols = c || ''; return this; }
  update(p) { this.op = 'update'; this.patch = p; return this; }
  insert(p) { this.op = 'insert'; this.patch = p; return this; }
  upsert(p) { this.op = 'upsert'; this.patch = p; return this; }
  eq(k, v) { this.f.push(['eq', k, v]); return this; }
  neq(k, v) { this.f.push(['neq', k, v]); return this; }
  order(k, o) { this.ord = [k, o]; return this; }
  limit(n) { this.lim = n; return this; }
  single() { this.one = true; return this; }
  maybeSingle() { this.one = true; return this; }
  then(res, rej) { return Promise.resolve(this.run()).then(res, rej); }
  match(r) { return this.f.every(([op, k, v]) => (op === 'eq' ? r[k] == v : r[k] != v)); }
  run() {
    const rows = DATA[this.t];
    if (!rows) return { data: this.one ? null : [], error: null };
    if (this.op === 'update') {
      calls.push({ type: 'update', table: this.t, patch: this.patch, filters: this.f.map((x) => x.join(':')) });
      for (const r of rows.filter((r) => this.match(r))) {
        const was = r.status;
        Object.assign(r, this.patch);
        if (this.t === 'orders' && this.patch.status && this.patch.status !== was) {
          if (this.patch.status === 'da_giao') {
            const m = memberOf(r.member_id) || DATA.members[0];
            r.member_id = m.id; r.delivered_at = new Date().toISOString(); r.points_awarded = Math.floor(r.total / 10000);
            m.points += r.points_awarded; m.order_count += 1;
          } else if (was === 'da_giao') { memberOf(r.member_id).points -= r.points_awarded; r.member_id = null; r.delivered_at = null; r.points_awarded = 0; }
        }
      }
      return { data: null, error: null };
    }
    if (this.op !== 'select') { calls.push({ type: this.op, table: this.t, patch: this.patch }); return { data: this.one ? { id: 99 } : null, error: null }; }
    let out = clone(rows.filter((r) => this.match(r)));
    if (this.t === 'orders') for (const r of out) r.member = memberOf(r.member_id);
    if (this.ord) { const [k, o] = this.ord; const asc = !o || o.ascending !== false; out.sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (asc ? 1 : -1)); }
    if (this.lim) out = out.slice(0, this.lim);
    calls.push({ type: 'select', table: this.t, cols: this.cols, filters: this.f.map((x) => x.join(':')), order: this.ord, limit: this.lim });
    return { data: this.one ? (out[0] || null) : out, error: null };
  }
}
export function createClient() {
  const channel = { on() { return channel; }, subscribe() { return channel; }, unsubscribe() {} };
  const session = { user: { id: 'staff-1', email: 'nv@example.com' } };
  return {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      getUser: async () => ({ data: { user: session.user }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({ error: null }),
    },
    from: (t) => new Q(t),
    rpc: async (name, args) => {
      calls.push({ type: 'rpc', name, args });
      if (name === 'link_member' && args.p_email === 'khongco@example.com') return { data: null, error: { message: 'Không tìm thấy email' } };
      return { data: null, error: null };
    },
    channel: () => channel,
    removeChannel() {},
    storage: { from: () => ({}) },
  };
}
export default { createClient };
`;

const CONFIG = fs.readFileSync(path.join(ROOT, 'js', 'config.js'), 'utf8')
  .replace('https://YOUR-PROJECT.supabase.co', 'https://test.supabase.co').replace('YOUR-ANON-KEY', 'test-anon-key');

// ---------- Kiểm thử ----------
const results = [];
let failed = 0;
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? '  → ' + detail : ''}`);
};

const server = await startServer();
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ executablePath: findChrome(), args: ['--no-sandbox'] });

async function newPage(w, h) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, locale: 'vi-VN', isMobile: w <= 600, hasTouch: w <= 600 });
  await context.route('**/*', (route) => {
    const url = route.request().url();
    // js/config.js gốc còn giá trị mẫu → đổi sang cấu hình giả để trang nạp supabase-js (đã được stub)
    if (url === origin + '/js/config.js')
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: CONFIG });
    // Ảnh hỏng giả lập: thẻ sản phẩm phải tự thay bằng logo
    if (url.startsWith(origin + '/assets/img/gach-vang-')) return route.fulfill({ status: 404, body: '' });
    if (url.startsWith(origin)) return route.continue();
    if (url.includes('/html2canvas/'))
      return H2C_FILE ? route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(H2C_FILE) }) : route.continue();
    if (/^https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[^/]+\/\+esm/.test(url))
      return route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: STUB });
    if (process.env.REAL_FONTS && /fonts\.(googleapis|gstatic)\.com/.test(url)) return route.continue();
    if (/fonts\.(googleapis|gstatic)\.com/.test(url))
      return route.fulfill({ status: 200, contentType: url.includes('googleapis') ? 'text/css' : 'font/woff2', headers: { 'access-control-allow-origin': '*' }, body: '' });
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, body: '' });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.message || e)));
  page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('/assets/img/gach-vang-')) errors.push(`HTTP ${r.status()}: ${r.url()}`); });
  page.dialogs = [];
  page.dialogAnswer = true;
  page.on('dialog', async (d) => { page.dialogs.push(d.message()); await (page.dialogAnswer ? d.accept() : d.dismiss()); });
  return { page, errors, context };
}

const calls = (page) => page.evaluate(() => window.__calls);
const rowCount = (page, sel) => page.locator(sel + ' tr').count();
const text = (page, sel) => page.locator(sel).innerText();
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const toastText = async (page) => {
  await page.waitForFunction(() => document.querySelector('#toast.show'), null, { timeout: 4000 });
  return text(page, '#toast');
};

try {
  // ===== Trang chủ: bảng giá HTML =====
  for (const w of [1280, 390]) {
    const { page, errors, context } = await newPage(w, 900);
    await page.goto(origin + '/index.html', { waitUntil: 'load' });
    await page.waitForSelector('#priceBoard .pb-row', { timeout: 8000 });
    const rows = await page.locator('#priceBoard .pb-row').allInnerTexts();
    check(`${w}px: bảng giá hiện đủ ${DATA.products.length} loại từ CSDL`, rows.length === DATA.products.length && rows[0].includes('Cua don') && rows[0].includes('240.000đ') && rows[1].includes('600.000đ'), rows.join(' | '));
    check(`${w}px: không còn ảnh bảng giá tĩnh`, (await page.locator('img.pricelist').count()) === 0);
    check(`${w}px: loại Đặc biệt được làm nổi`, (await page.locator('#priceBoard .pb-hot').count()) === 2);
    check(`${w}px: ngày áp dụng = lần đổi giá gần nhất (21/10/2026)`, (await text(page, '#priceBoard .pb-date')).includes('21/10/2026'), await text(page, '#priceBoard .pb-date'));
    check(`${w}px: thẻ sản phẩm cùng giá với bảng`, (await text(page, '#products')).includes('240.000đ'));
    // Menu: "Sản phẩm", "Bảng giá"
    const nav = await page.locator('#mainNav').evaluate((n) => n.textContent);
    check(`${w}px: menu đổi tên Sản phẩm / Bảng giá`, nav.includes('Sản phẩm') && nav.includes('Bảng giá') && !nav.includes('Cua sống') && !nav.includes('Món chế biến'), nav.replace(/\s+/g, ' '));
    check(`${w}px: menu Bảng giá trỏ tới #bang-gia`, (await page.locator('#mainNav a', { hasText: 'Bảng giá' }).getAttribute('href')) === '#bang-gia');

    // Ảnh sản phẩm: sản phẩm mới không còn ô trống
    await page.waitForTimeout(800);
    const media = await page.locator('#products .product-card').evaluateAll((cards) => cards.map((c) => {
      const img = c.querySelector('.product-media img');
      return { name: c.querySelector('h3').textContent, ph: !!c.querySelector('.media-ph'), src: img?.currentSrc || img?.src || '' };
    }));
    const m = (n) => media.find((x) => x.name === n) || {};
    check(`${w}px: mọi thẻ sản phẩm đều có ảnh`, media.length === DATA.products.length && media.every((x) => x.src), JSON.stringify(media));
    check(`${w}px: "Cua gạch nhỏ" dùng ảnh gạch son`, m('Cua gạch nhỏ').src.includes('gach-son-do') && !m('Cua gạch nhỏ').ph, JSON.stringify(m('Cua gạch nhỏ')));
    check(`${w}px: sản phẩm lạ hiện logo`, m('Cua cốm').ph && m('Cua cốm').src.includes('logo'), JSON.stringify(m('Cua cốm')));
    check(`${w}px: ảnh lỗi tự thay bằng logo`, m('Cua tứ').ph, JSON.stringify(m('Cua tứ')));

    check(`${w}px: không cuộn ngang`, await noHScroll(page));
    await page.locator('#bang-gia').screenshot({ path: path.join(OUT, `bang-gia-html-${w}.png`) });
    await page.locator('#san-pham').screenshot({ path: path.join(OUT, `san-pham-${w}.png`) });

    // Nút tải ảnh bảng giá
    const btn = page.locator('#pbDownload');
    check(`${w}px: nút "Tải ảnh bảng giá" ngay dưới bảng giá`, await btn.isEnabled() && await page.evaluate(() =>
      document.querySelector('#priceBoard').nextElementSibling?.contains(document.querySelector('#pbDownload'))));
    if (w <= 600) await page.evaluate(() => { navigator.canShare = undefined; }); // bảng chia sẻ không chạy trong headless → tải file
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), btn.click()]);
    const file = path.join(OUT, `bang-gia-tai-ve-${w}.png`);
    await dl.saveAs(file);
    const buf = fs.readFileSync(file);
    const pngW = buf.readUInt32BE(16), pngH = buf.readUInt32BE(20);
    check(`${w}px: tải về PNG khổ 620px ×2 (${pngW}×${pngH})`, buf.subarray(1, 4).toString() === 'PNG' && pngW === 1240 && pngH > 1200, `${pngW}×${pngH}`);
    check(`${w}px: tên file có ngày áp dụng`, dl.suggestedFilename() === 'bang-gia-cua-co-thuy-2026-10-21.png', dl.suggestedFilename());
    check(`${w}px: nút trở lại bình thường`, (await btn.innerText()).includes('Tải ảnh bảng giá') && await btn.isEnabled());
    check(`${w}px: không lỗi console`, errors.length === 0, errors.join(' || '));
    await context.close();
  }

  // ===== Trang quản lý: tab Sản phẩm & giá =====
  const { page, errors, context } = await newPage(1280, 900);
  await page.goto(origin + '/quan-ly.html', { waitUntil: 'load' });
  await page.waitForSelector('#orderRows [data-edit]', { timeout: 8000 });
  await page.click('#nav [data-tab=products]');
  await page.waitForSelector('#productRows tr [name=cost]');
  check('tab sản phẩm có cột chọn ảnh', (await page.locator('#productRows select[name=image]:not([disabled])').count()) === DATA.products.length);
  check('ảnh đã chọn được giữ', (await page.inputValue('#productRows tr[data-id="9"] [name=image]')) === 'gach-vang');
  await page.selectOption('#productRows tr[data-id="8"] [name=image]', 'mai-cua-gach');
  check('đổi ảnh → ảnh nhỏ cập nhật', (await page.getAttribute('#productRows tr[data-id="8"] .pimg', 'src')).includes('mai-cua-gach'));
  await page.fill('#productRows tr[data-id="8"] [name=cost]', '400000');
  await page.click('#productRows tr[data-id="8"] button');
  await page.waitForTimeout(300);
  const pimg = (await calls(page)).find((c) => c.type === 'update' && c.table === 'products');
  check('Lưu gửi products.image', pimg?.patch?.image === 'mai-cua-gach', JSON.stringify(pimg));
  await page.evaluate(() => { window.__calls.length = 0; });
  check('tab sản phẩm hiện giá vốn và % lãi', (await page.inputValue('#productRows tr:first-child [name=cost]')) === '208000'
    && (await page.inputValue('#productRows tr:first-child [name=markup_pct]')) === '15');
  await page.fill('#productRows tr:first-child [name=cost]', '200000');
  check('xem trước giá bán: 200.000 × 1,15 = 230.000đ', (await text(page, '#productRows tr:first-child .sell-price')).includes('230.000đ'), await text(page, '#productRows tr:first-child .sell-price'));
  await page.fill('#productRows tr:first-child [name=markup_pct]', '16');
  check('làm tròn lên 10.000: 200.000 × 1,16 = 232.000 → 240.000đ', (await text(page, '#productRows tr:first-child .sell-price')).includes('240.000đ'));
  await page.click('#productRows tr:first-child button');
  await page.waitForTimeout(300);
  let cs = await calls(page);
  const up = cs.find((c) => c.type === 'upsert' && c.table === 'product_costs');
  check('Lưu ghi product_costs {product_id, cost, markup_pct}', up && up.patch.product_id === 1 && up.patch.cost === 200000 && up.patch.markup_pct === 16, JSON.stringify(up));
  const pu = cs.find((c) => c.type === 'update' && c.table === 'products');
  check('Lưu sản phẩm không tự ghi giá bán', pu && !('price' in pu.patch), JSON.stringify(pu));
  await page.screenshot({ path: path.join(OUT, 'bang-gia-quan-ly-1280.png'), fullPage: true });

  // ===== Sửa đơn: nhân viên đổi giá bán =====
  await page.click('#nav [data-tab=orders]');
  await page.waitForSelector('#orderRows [data-edit]');
  await page.locator('#orderRows [data-edit]').first().click();
  await page.waitForSelector('#editDialog[open] [name=unit_price]');
  check('dòng hàng có ô giá bán, mặc định giá trong đơn', (await page.inputValue('#editDialog [name=unit_price]')) === '240000');
  await page.fill('#editDialog [name=unit_price]', '225000');
  check('tổng tiền tính theo giá đã sửa (2 kg × 225.000)', (await text(page, '#editSum')) === (450000).toLocaleString('vi-VN') + 'đ', await text(page, '#editSum'));
  await page.screenshot({ path: path.join(OUT, 'bang-gia-sua-don-1280.png') });
  await page.click('#editForm button[type=submit]');
  await page.waitForTimeout(300);
  cs = await calls(page);
  const uo = cs.find((c) => c.type === 'rpc' && c.name === 'update_order');
  check('update_order gửi unit_price', uo && uo.args.p_items[0].unit_price === 225000 && uo.args.p_items[0].quantity === 2, JSON.stringify(uo?.args?.p_items));
  check('quản lý: không lỗi console', errors.length === 0, errors.join(' || '));
  await context.close();
} catch (e) {
  failed++;
  console.error('LỖI KHI CHẠY:', e);
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${results.length - failed}/${results.length} đạt${failed ? `, ${failed} lỗi` : ''}. Ảnh: ${OUT}/bang-gia-*.png`);
process.exit(failed ? 1 : 0);
