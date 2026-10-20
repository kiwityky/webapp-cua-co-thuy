#!/usr/bin/env node
// Kiểm thử tab "Đã giao" và "Thành viên" của quan-ly.html bằng Playwright + stub Supabase riêng.
// Chạy: node tools/test/quan-ly-members.mjs   (từ thư mục webapp)
// Biến môi trường tuỳ chọn: OUT_DIR (mặc định ../webapp-test), CHROME_PATH.
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
  products: [{ id: 1, name: 'Cua don', description: '5–6 con/kg', price: 240000, unit: 'kg', badge: null, sort: 1, active: true }],
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
    if (this.op !== 'select') { calls.push({ type: this.op, table: this.t, patch: this.patch }); return { data: null, error: null }; }
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
    if (url.startsWith(origin)) return route.continue();
    if (/^https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[^/]+\/\+esm/.test(url))
      return route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: STUB });
    if (/fonts\.(googleapis|gstatic)\.com/.test(url))
      return route.fulfill({ status: 200, contentType: url.includes('googleapis') ? 'text/css' : 'font/woff2', headers: { 'access-control-allow-origin': '*' }, body: '' });
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, body: '' });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.message || e)));
  page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`); });
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
  // ===== Máy tính 1280px =====
  const { page, errors, context } = await newPage(1280, 900);
  await page.goto(origin + '/quan-ly.html', { waitUntil: 'load' });
  await page.waitForSelector('#orderRows tr[data-x], #orderRows select[data-status]', { timeout: 8000 });

  // --- Tab Đơn hàng ---
  const navLabels = await page.locator('#nav a[data-tab]').allInnerTexts();
  check('menu có Đã giao và Thành viên ngay sau Đơn hàng', navLabels.slice(0, 3).join('|') === 'Đơn hàng|Đã giao|Thành viên', navLabels.join('|'));
  check('tab Đơn hàng chỉ có đơn chưa giao (5 đơn, gồm hủy)', (await rowCount(page, '#orderRows')) === 5);
  check('tab Đơn hàng không có đơn #21', !(await text(page, '#orderRows')).includes('#21'));
  const statsTxt = await text(page, '#stats');
  check('thống kê Mới=2, Đã xác nhận=1, Đang giao=1', /Mới\s*\n?\s*2/.test(statsTxt) && /Đã xác nhận\s*\n?\s*1/.test(statsTxt) && /Đang giao\s*\n?\s*1/.test(statsTxt), statsTxt);
  const expectRevenue = (480000 + 240000).toLocaleString('vi-VN') + 'đ';
  check('doanh thu hôm nay chỉ tính đơn giao hôm nay', statsTxt.includes(expectRevenue), statsTxt + ' | cần ' + expectRevenue);
  check('có chú thích đơn Đã giao', (await text(page, '#tab-orders')).includes('Đơn chuyển sang Đã giao sẽ nằm ở tab Đã giao'));
  const filterOpts = await page.locator('#fStatus option').allInnerTexts();
  check('bộ lọc trạng thái không có "Đã giao"', !filterOpts.includes('Đã giao'), filterOpts.join(','));
  let cs = await calls(page);
  check('truy vấn đơn đang xử lý dùng neq status da_giao', cs.some((c) => c.type === 'select' && c.table === 'orders' && c.filters.includes('neq:status:da_giao') && c.limit === 500));
  check('truy vấn đơn đã giao dùng eq da_giao + order delivered_at + member', cs.some((c) => c.type === 'select' && c.table === 'orders' && c.filters.includes('eq:status:da_giao') && c.order?.[0] === 'delivered_at' && c.cols.includes('member:members(')));
  await page.screenshot({ path: path.join(OUT, 'members-orders-1280.png'), fullPage: true });

  // --- Tab Đã giao ---
  await page.click('#nav [data-tab=delivered]');
  await page.waitForSelector('#deliveredRows select[data-dstatus]');
  check('tab Đã giao hiện 3 đơn', (await rowCount(page, '#deliveredRows')) === 3);
  const order = (await page.locator('#deliveredRows tr td:first-child b').allInnerTexts());
  check('đơn đã giao sắp theo delivered_at mới nhất (21, 22, 23)', order.join(',') === '#21,#22,#23', order.join(','));
  const dStats = await text(page, '#deliveredStats');
  check('thống kê Đã giao: 3 đơn, tổng điểm 72, doanh thu hôm nay', /3/.test(dStats) && /72/.test(dStats) && dStats.includes(expectRevenue), dStats);
  const dText = await text(page, '#deliveredRows');
  check('hiện +24 điểm và điểm hiện tại của thành viên', dText.includes('+24') && dText.includes('Điểm hiện tại: 48'));
  check('hiện huy hiệu Thành viên và nút Sửa đơn', (await page.locator('#deliveredRows .badge').count()) === 3 && (await page.locator('#deliveredRows [data-edit]').count()) === 3);
  check('tên khách được escape (không sinh thẻ b)', (await page.locator('#deliveredRows b', { hasText: /^$/ }).count()) >= 0 && !(await page.locator('#deliveredRows').innerHTML()).includes('Bình <b>'));
  await page.fill('#fSearchDelivered', '0912000002');
  check('tìm theo SĐT trong tab Đã giao', (await rowCount(page, '#deliveredRows')) === 1);
  await page.fill('#fSearchDelivered', '');
  check('có select 5 trạng thái, đang chọn Đã giao', (await page.locator('#deliveredRows select[data-dstatus="21"]').inputValue()) === 'da_giao');
  await page.screenshot({ path: path.join(OUT, 'members-delivered-1280.png'), fullPage: true });

  // Hủy hộp thoại xác nhận → không update
  page.dialogAnswer = false;
  const before = (await calls(page)).filter((c) => c.type === 'update').length;
  await page.selectOption('#deliveredRows select[data-dstatus="22"]', 'dang_giao');
  await page.waitForTimeout(300);
  check('đổi khỏi Đã giao có hộp thoại xác nhận', page.dialogs.length === 1 && /hoàn lại/.test(page.dialogs[0]), page.dialogs.join('|'));
  check('bấm Hủy thì không gọi update và select trở lại Đã giao', (await calls(page)).filter((c) => c.type === 'update').length === before
    && (await page.locator('#deliveredRows select[data-dstatus="22"]').inputValue()) === 'da_giao');
  // Đồng ý
  page.dialogAnswer = true;
  await page.selectOption('#deliveredRows select[data-dstatus="22"]', 'dang_giao');
  await page.waitForFunction(() => document.querySelectorAll('#deliveredRows select[data-dstatus]').length === 2);
  cs = await calls(page);
  check('đồng ý thì update status=dang_giao cho đơn 22', cs.some((c) => c.type === 'update' && c.table === 'orders' && c.patch.status === 'dang_giao' && c.filters.includes('eq:id:22')));
  check('đơn 22 biến khỏi tab Đã giao', !(await text(page, '#deliveredRows')).includes('#22'));
  await page.click('#nav [data-tab=orders]');
  await page.waitForFunction(() => document.querySelectorAll('#orderRows select[data-status]').length === 6);
  check('đơn 22 quay lại tab Đơn hàng', (await text(page, '#orderRows')).includes('#22'));

  // --- Đổi một đơn sang Đã giao ở tab Đơn hàng ---
  await page.selectOption('#orderRows select[data-status="11"]', 'da_giao');
  const t = await toastText(page);
  check('toast đơn giao: tên + điểm', /^Đơn #11 đã giao · .+ · \+48 điểm/.test(t), t);
  check('toast nói rõ thành viên đã có (tổng điểm)', /là thành viên · \+48 điểm, tổng \d+ điểm/.test(t), t);
  cs = await calls(page);
  check('update status=da_giao cho đơn 11', cs.some((c) => c.type === 'update' && c.table === 'orders' && c.patch.status === 'da_giao' && c.filters.includes('eq:id:11')));
  check('đọc lại points_awarded + member sau khi giao', cs.some((c) => c.type === 'select' && c.table === 'orders' && c.cols.startsWith('points_awarded') && c.filters.includes('eq:id:11')));
  await page.waitForFunction(() => !document.querySelector('#orderRows [data-status="11"]'));
  check('đơn 11 biến khỏi tab Đơn hàng', !(await text(page, '#orderRows')).includes('#11'));
  // đơn giao lần đầu của thành viên mới
  await page.evaluate(() => { window.__data.members[2].order_count = 0; });
  await page.evaluate(() => { const o = window.__data.orders.find((x) => x.id === 12); o.member_id = 3; });
  await page.selectOption('#orderRows select[data-status="12"]', 'da_giao');
  await page.waitForFunction(() => document.querySelector('#toast')?.textContent.startsWith('Đơn #12'));
  const t2 = await text(page, '#toast');
  check('toast thành viên mới (order_count == 1)', /Lê Minh trở thành thành viên mới · \+48 điểm/.test(t2), t2);

  // --- Tab Thành viên ---
  await page.click('#nav [data-tab=members]');
  await page.waitForSelector('#memberRows [data-medit]');
  check('tab Thành viên hiện 3 thành viên', (await rowCount(page, '#memberRows')) === 3);
  const mStats = await text(page, '#memberStats');
  check('thống kê thành viên: 3 thành viên, 1 đã gắn tài khoản', /3/.test(mStats) && /1/.test(mStats), mStats);
  const mText = await text(page, '#memberRows');
  check('hiện đơn đã mua, huy hiệu gắn/chưa gắn', mText.includes('3 đơn') && mText.includes('Đã gắn tài khoản') && mText.includes('Chưa gắn'));
  check('có giải thích đầu tab', (await text(page, '#tab-members')).includes('tạo tự động theo số điện thoại'));
  check('tên thành viên được escape', !(await page.locator('#memberRows').innerHTML()).includes('Bình <b>'));
  await page.fill('#fSearchMembers', 'hoa');
  check('tìm theo tên thành viên', (await rowCount(page, '#memberRows')) === 1);
  await page.fill('#fSearchMembers', '0912000003');
  check('tìm theo SĐT thành viên', (await rowCount(page, '#memberRows')) === 1);
  await page.fill('#fSearchMembers', '');
  await page.screenshot({ path: path.join(OUT, 'members-members-1280.png'), fullPage: true });

  // Sửa
  await page.click('[data-medit="2"]');
  await page.waitForSelector('#memberDialog[open]');
  await page.fill('#memberForm [name=full_name]', 'Trần Bình');
  await page.fill('#memberForm [name=note]', 'Ghi chú mới');
  await page.screenshot({ path: path.join(OUT, 'members-edit-dialog-1280.png') });
  await page.click('#memberForm button[type=submit]');
  await page.waitForFunction(() => !document.querySelector('#memberDialog[open]'));
  cs = await calls(page);
  const um = cs.find((c) => c.type === 'rpc' && c.name === 'update_member');
  check('Sửa gọi rpc update_member đúng tham số', um && um.args.p_member === 2 && um.args.p_full_name === 'Trần Bình' && um.args.p_note === 'Ghi chú mới' && 'p_address' in um.args, JSON.stringify(um));

  // Gắn tài khoản: lỗi rồi thành công
  await page.click('[data-mlink="2"]');
  await page.waitForSelector('#memberDialog[open]');
  await page.fill('#memberForm [name=email]', 'khongco@example.com');
  await page.click('#memberForm button[type=submit]');
  const te = await toastText(page);
  check('lỗi link_member hiện error.message và giữ hộp thoại', te === 'Không tìm thấy email' && (await page.locator('#memberDialog[open]').count()) === 1, te);
  await page.fill('#memberForm [name=email]', 'khach@example.com');
  await page.screenshot({ path: path.join(OUT, 'members-link-dialog-1280.png') });
  await page.click('#memberForm button[type=submit]');
  await page.waitForFunction(() => !document.querySelector('#memberDialog[open]'));
  cs = await calls(page);
  const lm = cs.filter((c) => c.type === 'rpc' && c.name === 'link_member');
  check('Gắn tài khoản gọi rpc link_member với p_member, p_email', lm.length === 2 && lm[1].args.p_member === 2 && lm[1].args.p_email === 'khach@example.com', JSON.stringify(lm));
  // Bỏ gắn
  await page.click('[data-mlink="1"]');
  await page.waitForSelector('#memberDialog[open]');
  await page.click('#memberForm button[type=submit]');
  await page.waitForFunction(() => !document.querySelector('#memberDialog[open]'));
  const lm2 = (await calls(page)).filter((c) => c.type === 'rpc' && c.name === 'link_member').pop();
  check('để trống email = bỏ gắn (p_email null)', lm2.args.p_member === 1 && lm2.args.p_email === null, JSON.stringify(lm2));

  // Xem đơn
  await page.click('[data-morders="1"]');
  await page.waitForSelector('#deliveredRows select[data-dstatus]');
  check('Xem đơn chuyển sang tab Đã giao và điền SĐT', (await page.inputValue('#fSearchDelivered')) === '0912000001' && !(await page.locator('#tab-delivered').evaluate((e) => e.classList.contains('hidden'))));
  check('Xem đơn lọc đúng đơn của thành viên', (await rowCount(page, '#deliveredRows')) >= 1 && !(await text(page, '#deliveredRows')).includes('0912000002'));

  check('1280px: không cuộn ngang cả trang', await noHScroll(page));
  check('1280px: không lỗi console', errors.length === 0, errors.join(' || '));
  await context.close();

  // ===== Điện thoại 390px =====
  const m = await newPage(390, 844);
  await m.page.goto(origin + '/quan-ly.html', { waitUntil: 'load' });
  await m.page.waitForSelector('#orderRows select[data-status]');
  for (const tab of ['orders', 'delivered', 'members']) {
    await m.page.click(`#nav [data-tab=${tab}]`);
    await m.page.waitForSelector(`#tab-${tab}:not(.hidden) tbody tr`);
    await m.page.waitForTimeout(150);
    check(`390px: tab ${tab} không cuộn ngang cả trang`, await noHScroll(m.page),
      await m.page.evaluate(() => document.documentElement.scrollWidth + ' > ' + innerWidth));
    const scrolls = await m.page.locator(`#tab-${tab} .table-wrap`).evaluate((e) => getComputedStyle(e).overflowX === 'auto' && e.scrollWidth >= e.clientWidth);
    check(`390px: bảng tab ${tab} nằm trong .table-wrap cuộn ngang`, scrolls);
    await m.page.screenshot({ path: path.join(OUT, `members-${tab}-390.png`), fullPage: true });
  }
  await m.page.click('[data-mlink="2"]');
  await m.page.waitForSelector('#memberDialog[open]');
  check('390px: hộp thoại gắn tài khoản vừa màn hình', await m.page.locator('#memberDialog').evaluate((e) => e.getBoundingClientRect().width <= innerWidth - 16));
  await m.page.screenshot({ path: path.join(OUT, 'members-link-dialog-390.png') });
  check('390px: không lỗi console', m.errors.length === 0, m.errors.join(' || '));
  await m.context.close();
} catch (e) {
  failed++;
  console.error('LỖI KHI CHẠY:', e);
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${results.length - failed}/${results.length} đạt${failed ? `, ${failed} lỗi` : ''}. Ảnh: ${OUT}/members-*.png`);
process.exit(failed ? 1 : 0);
