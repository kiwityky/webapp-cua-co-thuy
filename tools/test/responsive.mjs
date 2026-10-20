#!/usr/bin/env node
// Kiểm thử hiển thị responsive cho webapp Cua Cô Thúy.
// Chạy: node tools/test/responsive.mjs   (từ thư mục webapp)
// Biến môi trường tuỳ chọn: OUT_DIR (mặc định ../webapp-test cạnh thư mục webapp), CHROME_PATH.
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

// ---------- Tìm module playwright ----------
function loadPlaywright() {
  const req = createRequire(import.meta.url);
  const cands = [
    path.join(HERE, 'node_modules', 'playwright-core'),
    path.join(HERE, 'node_modules', 'playwright'),
    'playwright', 'playwright-core',
    ...(process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean).flatMap(p => [path.join(p, 'playwright'), path.join(p, 'playwright-core')]),
  ];
  try {
    const g = execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    cands.push(path.join(g, 'playwright'), path.join(g, 'playwright-core'));
  } catch {}
  for (const c of cands) { try { return req(c); } catch {} }
  throw new Error('Không tìm thấy playwright. Cài: cd tools/test && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright-core');
}
function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    const dirs = fs.readdirSync(base).filter(d => /^chromium-\d+$/.test(d)).sort().reverse();
    for (const d of dirs) {
      const p = path.join(base, d, 'chrome-linux', 'chrome');
      if (fs.existsSync(p)) return p;
    }
  } catch {}
  return undefined; // để playwright tự tìm
}
const { chromium } = loadPlaywright();

// ---------- Static server ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2', '.txt': 'text/plain' };
function startServer() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, path.normalize(p));
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('404'); }
      res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(buf);
    });
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

// ---------- Cấu hình ----------
const PAGES = ['index.html', 'tai-khoan.html', 'quan-ly.html'];
const VIEWPORTS = [[360, 740], [390, 844], [768, 1024], [1024, 768], [1440, 900]];
const MOBILE_MAX = 600;
const STUB = fs.readFileSync(path.join(HERE, 'supabase-stub.mjs'), 'utf8');

// withSupabase: giả lập đã cấu hình Supabase (config.js mẫu → URL giả) để js/common.js nạp stub thay vì để sb = null.
// Dùng cho quan-ly.html để các tab Đã giao / Thành viên chạy qua code truy vấn thật (stub trả dữ liệu rỗng).
async function setupRoutes(context, origin, ext, withSupabase = false) {
  await context.route('**/*', route => {
    const url = route.request().url();
    if (withSupabase && url.startsWith(origin) && new URL(url).pathname === '/js/config.js') {
      const cfg = fs.readFileSync(path.join(ROOT, 'js', 'config.js'), 'utf8')
        .replace(/YOUR-PROJECT/g, 'stub-project').replace(/YOUR-ANON-KEY/g, 'stub-anon-key');
      return route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'cache-control': 'no-store' }, body: cfg });
    }
    if (url.startsWith(origin)) return route.continue();
    if (/^https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[^/]+\/\+esm/.test(url))
      return route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: STUB });
    if (/fonts\.(googleapis|gstatic)\.com/.test(url))
      return route.fulfill({ status: 200, contentType: url.includes('googleapis') ? 'text/css' : 'font/woff2', headers: { 'access-control-allow-origin': '*' }, body: '' });
    ext.add(url.split('?')[0]);
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, body: '' });
  });
}

const LCP_INIT = `
  window.__lcp = { t: 0, el: '', size: 0 };
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) {
    const el = e.element; let d = '';
    if (el) { d = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : ''); if (el.currentSrc || el.src) d += ' [' + (el.currentSrc || el.src).split('/').pop() + ']'; }
    window.__lcp = { t: e.startTime, el: d, size: e.size }; } }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch (e) {}
`;

// Hàm chạy trong trang: mô tả phần tử bằng selector ngắn
const DESC_FN = `window.__desc = el => { if (!el || !el.tagName) return '?'; let s = el.tagName.toLowerCase(); if (el.id) return s + '#' + el.id;
  if (typeof el.className === 'string' && el.className.trim()) s += '.' + el.className.trim().split(/\\s+/).slice(0,3).join('.');
  const p = el.parentElement; if (p && p !== document.body) { let ps = p.tagName.toLowerCase(); if (p.id) ps += '#' + p.id; else if (typeof p.className === 'string' && p.className.trim()) ps += '.' + p.className.trim().split(/\\s+/)[0]; s = ps + ' > ' + s; }
  const t = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\\s+/g,' ').slice(0, 30); return t ? s + ' ("' + t + '")' : s; };`;

async function autoScroll(page) {
  await page.evaluate(async () => {
    const step = Math.max(200, innerHeight * 0.8);
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) { scrollTo({ top: y, left: 0, behavior: 'instant' }); await new Promise(r => setTimeout(r, 120)); }
    scrollTo({ top: document.documentElement.scrollHeight, left: 0, behavior: 'instant' }); await new Promise(r => setTimeout(r, 300));
  });
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.evaluate(async () => {
    await Promise.all([...document.images].filter(i => !i.complete).map(i => new Promise(r => { i.onload = i.onerror = r; setTimeout(r, 4000); })));
  });
}

async function runCase(browser, origin, pageName, [w, h]) {
  const issues = []; // {sev, check, msg}
  const add = (sev, check, msg) => issues.push({ sev, check, msg });
  const ext = new Set();
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w <= MOBILE_MAX, hasTouch: w <= MOBILE_MAX, locale: 'vi-VN' });
  await setupRoutes(context, origin, ext, pageName === 'quan-ly.html');
  await context.addInitScript(LCP_INIT + DESC_FN);
  const page = await context.newPage();
  const bytes = { initial: 0, total: 0, byType: {} };
  let phase = 'initial';
  page.on('console', m => { if (m.type() === 'error') add('cao', 'console', `console.error: ${m.text().slice(0, 300)}`); });
  page.on('pageerror', e => add('cao', 'pageerror', `pageerror: ${String(e.message || e).slice(0, 300)}`));
  page.on('response', async resp => {
    const url = resp.url();
    if (resp.status() >= 400) add('cao', '404', `HTTP ${resp.status()}: ${url.replace(origin, '')}`);
    if (!url.startsWith(origin)) return;
    try {
      if (phase === 'interact') return;
      const b = (await resp.body()).length;
      bytes.total += b; if (phase === 'initial') bytes.initial += b;
      const t = (resp.headers()['content-type'] || 'other').split(';')[0];
      bytes.byType[t] = (bytes.byType[t] || 0) + b;
    } catch {}
  });
  page.on('requestfailed', r => add('cao', 'request', `request failed: ${r.url().replace(origin, '')} (${r.failure()?.errorText})`));

  const result = { page: pageName, w, h, checks: {}, issues, ext, bytes, lcp: null, shot: null };
  const mark = (name, ok) => { result.checks[name] = result.checks[name] === false ? false : ok; };
  try {
    await page.goto(origin + '/' + pageName, { waitUntil: 'load', timeout: 20000 });
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(400);
    phase = 'scrolled';
    result.lcp = await page.evaluate(() => window.__lcp);
    await autoScroll(page);
    await page.evaluate(() => scrollTo({ top: 0, left: 0, behavior: 'instant' }));
    await page.waitForTimeout(300);

    // 1. Cuộn ngang
    const hs = await page.evaluate(() => {
      const sw = document.documentElement.scrollWidth, iw = innerWidth;
      const off = [];
      if (sw > iw) for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.width && r.right > iw + 1 && getComputedStyle(el).position !== 'fixed') {
          // chỉ lấy phần tử ngoài cùng (cha không tràn)
          const pr = el.parentElement?.getBoundingClientRect();
          if (!pr || pr.right <= iw + 1) off.push(`${window.__desc(el)} right=${Math.round(r.right)}px`);
        }
        if (off.length >= 6) break;
      }
      return { sw, iw, off };
    });
    const hsOk = hs.sw <= hs.iw; mark('Không cuộn ngang', hsOk);
    if (!hsOk) add('cao', 'Không cuộn ngang', `scrollWidth ${hs.sw} > innerWidth ${hs.iw}. Phần tử tràn: ${hs.off.join('; ') || '(không xác định)'}`);

    // 2. Ảnh
    const imgs = await page.evaluate(() => [...document.images].map(i => ({ ok: i.complete && i.naturalWidth > 0, src: (i.currentSrc || i.src || '').split('/').slice(-2).join('/'), d: window.__desc(i),
      dist: i.naturalWidth && i.clientWidth ? +(Math.abs((i.naturalWidth / i.naturalHeight) - (i.clientWidth / i.clientHeight))).toFixed(2) : 0,
      fit: getComputedStyle(i).objectFit, vis: i.getClientRects().length > 0 })));
    const badImgs = imgs.filter(i => !i.ok && i.vis);
    const hiddenBad = imgs.filter(i => !i.ok && !i.vis && i.src && !/lightbox/.test(i.d));
    mark('Ảnh load', badImgs.length === 0);
    for (const i of badImgs) add('cao', 'Ảnh load', `<img> không tải được (naturalWidth=0): ${i.d} src=${i.src || '(trống)'}`);
    for (const i of hiddenBad) add('thấp', 'Ảnh load', `<img> ẩn chưa tải: ${i.d} src=${i.src}`);
    for (const i of imgs.filter(i => i.ok && i.vis && i.fit === 'fill' && i.dist > 0.05)) add('trung bình', 'Ảnh méo', `Ảnh có thể bị méo (tỉ lệ lệch ${i.dist}, object-fit:fill): ${i.d}`);

    // 3. Kích thước vùng chạm (mobile)
    if (w <= MOBILE_MAX) {
      const navHidden = await page.evaluate(() => { const n = document.querySelector('.main-nav'); return n ? !n.getClientRects().length || getComputedStyle(n).visibility === 'hidden' || n.getBoundingClientRect().height < 5 : false; });
      let opened = false;
      if (navHidden && await page.locator('.nav-toggle').isVisible().catch(() => false)) { await page.locator('.nav-toggle').click(); await page.waitForTimeout(400); opened = true; }
      const small = await page.evaluate(() => [...document.querySelectorAll('.action-bar a, .action-bar button, .main-nav a, .main-nav button, .nav-toggle, .cart-btn')]
        .filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden')
        .map(e => { const r = e.getBoundingClientRect(); return { d: window.__desc(e), h: Math.round(r.height), w: Math.round(r.width) }; })
        .filter(x => x.h < 40 || x.w < 40));
      if (opened) { await page.locator('.nav-toggle').click().catch(() => {}); await page.waitForTimeout(300); }
      mark('Vùng chạm ≥40px', small.length === 0);
      for (const s of small) add('trung bình', 'Vùng chạm ≥40px', `${s.d}: ${s.w}×${s.h}px`);
    }

    // 4. Action bar không che nội dung cuối trang
    const ov = await page.evaluate(async () => {
      const bar = document.querySelector('.action-bar');
      if (!bar || !bar.getClientRects().length) return { none: true };
      const cs = getComputedStyle(bar);
      if (cs.position !== 'fixed' && cs.position !== 'sticky') return { none: true };
      scrollTo({ top: document.documentElement.scrollHeight, left: 0, behavior: 'instant' }); await new Promise(r => setTimeout(r, 300));
      const br = bar.getBoundingClientRect();
      const root = document.querySelector('footer') || document.querySelector('main') || document.body;
      const hits = [];
      const hit = r => { const ix = Math.min(r.right, br.right) - Math.max(r.left, br.left), iy = Math.min(r.bottom, br.bottom) - Math.max(r.top, br.top); return ix > 2 && iy > 2; };
      // So sánh theo hình chữ nhật của chính dòng chữ (Range) và của a/button/img, không theo cả khối
      const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n; (n = tw.nextNode());) {
        if (!n.textContent.trim() || bar.contains(n)) continue;
        const rg = document.createRange(); rg.selectNodeContents(n);
        if ([...rg.getClientRects()].some(hit)) hits.push(window.__desc(n.parentElement));
      }
      for (const el of root.querySelectorAll('a,button,img,input')) if (!bar.contains(el) && hit(el.getBoundingClientRect())) hits.push(window.__desc(el));
      const res = { barTop: Math.round(br.top), barH: Math.round(br.height), hits: [...new Set(hits)].slice(0, 5), pad: getComputedStyle(document.body).paddingBottom };
      scrollTo({ top: 0, left: 0, behavior: 'instant' }); return res;
    });
    if (!ov.none) {
      mark('Action-bar không che', ov.hits.length === 0);
      if (ov.hits.length) add('trung bình', 'Action-bar không che', `.action-bar (top=${ov.barTop}, cao ${ov.barH}px) che nội dung cuối trang khi cuộn hết: ${ov.hits.join('; ')} (body padding-bottom=${ov.pad})`);
    }

    // 4b. Action bar nổi che nút/link giữa trang (lấy mẫu nhiều vị trí cuộn)
    const mid = await page.evaluate(async () => {
      const bar = document.querySelector('.action-bar');
      if (innerWidth <= 600 || !bar || !bar.getClientRects().length || getComputedStyle(bar).position !== 'fixed') return []; // mobile: thanh đáy luôn che tạm thời, chỉ xét nút nổi desktop
      const out = new Set();
      const H = document.documentElement.scrollHeight;
      for (let y = 0; y < H; y += Math.round(innerHeight / 2)) {
        scrollTo({ top: y, left: 0, behavior: 'instant' }); await new Promise(r => setTimeout(r, 40));
        const br = bar.getBoundingClientRect();
        for (const el of document.querySelectorAll('main a, main button, .product-card .price, .site-footer a')) {
          if (bar.contains(el)) continue;
          const r = el.getBoundingClientRect();
          const ix = Math.min(r.right, br.right) - Math.max(r.left, br.left), iy = Math.min(r.bottom, br.bottom) - Math.max(r.top, br.top);
          if (ix > 4 && iy > 4) out.add(window.__desc(el));
        }
      }
      scrollTo({ top: 0, left: 0, behavior: 'instant' });
      return [...out].slice(0, 6);
    });
    if (mid.length) add('thấp', 'Action-bar che giữa trang', `.action-bar che (tạm thời, khi cuộn) các phần tử: ${mid.join('; ')}`);

    // Screenshot (trước tương tác)
    await page.evaluate(() => Promise.all([...document.images].map(i => i.decode().catch(() => {}))));
    await page.waitForTimeout(300);
    phase = 'interact';
    result.shot = path.join(OUT, `${pageName.replace('.html', '')}-${w}.png`);
    await page.screenshot({ path: result.shot, fullPage: true, animations: 'disabled' });

    // 5. Tương tác trên trang chủ
    if (pageName === 'index.html') {
      const T = 5000;
      // Giỏ hàng
      try {
        const btn = page.locator('button.add-cart, button:has-text("Thêm vào giỏ")').first();
        await btn.waitFor({ state: 'visible', timeout: T });
        const n0 = parseInt(await page.locator('#cartCount').textContent({ timeout: T }) || '0', 10) || 0;
        await btn.click({ timeout: T });
        await page.waitForTimeout(500);
        const n1 = parseInt(await page.locator('#cartCount').textContent() || '0', 10) || 0;
        const ok = n1 > n0; mark('Thêm vào giỏ', ok);
        if (!ok) add('cao', 'Thêm vào giỏ', `#cartCount không tăng sau khi bấm nút đầu tiên (trước ${n0}, sau ${n1})`);
      } catch (e) { mark('Thêm vào giỏ', false); add('cao', 'Thêm vào giỏ', `Không bấm được "Thêm vào giỏ": ${errMsg(e)}`); }
      // Tab Món chế biến
      try {
        await page.locator('button.cat-tab[data-cat="che-bien"]').click({ timeout: T });
        await page.waitForTimeout(300);
        const ok = await page.locator('#panel-che-bien').isVisible(); mark('Tab Món chế biến', ok);
        if (!ok) add('cao', 'Tab Món chế biến', '#panel-che-bien không hiện sau khi bấm button.cat-tab[data-cat="che-bien"]');
        const songHidden = !(await page.locator('#panel-song').isVisible());
        if (!songHidden) add('thấp', 'Tab Món chế biến', '#panel-song vẫn hiện khi đã chọn tab Món chế biến');
        await page.locator('button.cat-tab[data-cat="song"]').click({ timeout: T }).catch(() => {});
      } catch (e) { mark('Tab Món chế biến', false); add('cao', 'Tab Món chế biến', `Lỗi: ${errMsg(e)}`); }
      // Menu mobile
      if (w === 390 || w === 360) {
        try {
          await page.evaluate(() => scrollTo({ top: 0, left: 0, behavior: 'instant' }));
          await page.locator('.nav-toggle').click({ timeout: T });
          await page.waitForTimeout(400);
          const ok = await page.evaluate(() => document.querySelector('#mainNav')?.classList.contains('open'));
          const vis = await page.locator('#mainNav').isVisible();
          const exp = await page.locator('.nav-toggle').getAttribute('aria-expanded');
          mark('Menu mobile', !!ok && vis);
          if (!ok) add('cao', 'Menu mobile', '#mainNav không có class "open" sau khi bấm .nav-toggle');
          else if (!vis) add('cao', 'Menu mobile', '#mainNav.open nhưng không hiển thị');
          if (exp !== 'true') add('thấp', 'Menu mobile', `.nav-toggle aria-expanded="${exp}" sau khi mở (nên là "true")`);
          if (ok && w === 390) await page.screenshot({ path: path.join(OUT, `index-${w}-menu.png`) });
          await page.locator('.nav-toggle').click({ timeout: T }).catch(() => {});
        } catch (e) { mark('Menu mobile', false); add('cao', 'Menu mobile', `Lỗi: ${errMsg(e)}`); }
      }
      // Lightbox
      try {
        await page.keyboard.press('Escape').catch(() => {});
        const g = page.locator('#gallery .gallery-item, #gallery button, #gallery img').first();
        await g.scrollIntoViewIfNeeded({ timeout: T });
        await g.click({ timeout: T });
        await page.waitForTimeout(400);
        const ok = await page.evaluate(() => !!document.querySelector('dialog#lightbox')?.open);
        mark('Lightbox', ok);
        if (!ok) add('cao', 'Lightbox', 'dialog#lightbox không mở (open=false) sau khi bấm ảnh gallery đầu tiên');
        else {
          const lb = await page.evaluate(() => { const i = document.querySelector('#lightbox img'); const r = i?.getBoundingClientRect();
            return { ok: !!i && i.naturalWidth > 0, w: Math.round(r?.width || 0), h: Math.round(r?.height || 0), alt: i?.alt || '' }; });
          if (!lb.ok) { await page.waitForTimeout(1500); }
          const lb2 = await page.evaluate(() => { const i = document.querySelector('#lightbox img'); return !!i && i.naturalWidth > 0; });
          if (!lb2) add('cao', 'Lightbox', '#lightbox img không có ảnh (naturalWidth=0)');
          if (lb.w > w || lb.h > h) add('trung bình', 'Lightbox', `#lightbox img lớn hơn viewport (${lb.w}×${lb.h})`);
          if (!lb.alt) add('thấp', 'Lightbox', '#lightbox img thiếu alt khi mở');
          if (w === 390 || w === 1440) await page.screenshot({ path: path.join(OUT, `index-${w}-lightbox.png`) });
          await page.keyboard.press('Escape');
          await page.waitForTimeout(200);
          const closed = await page.evaluate(() => !document.querySelector('dialog#lightbox')?.open);
          if (!closed) add('thấp', 'Lightbox', 'Escape không đóng dialog#lightbox');
        }
      } catch (e) { mark('Lightbox', false); add('cao', 'Lightbox', `Lỗi: ${errMsg(e)}`); }
    }

    // 6. Trang quản lý: bấm lần lượt các tab (nhất là Đã giao và Thành viên) không được sinh lỗi console/pageerror.
    // Chưa đăng nhập thì thanh menu bị ẩn nên gọi click() bằng DOM; stub Supabase trả dữ liệu rỗng.
    if (pageName === 'quan-ly.html') {
      try {
        const tabs = await page.evaluate(() => [...document.querySelectorAll('[data-tab]')].map(a => a.dataset.tab));
        const missing = ['orders', 'delivered', 'members'].filter(t => !tabs.includes(t));
        mark('Tab Đã giao/Thành viên', missing.length === 0);
        if (missing.length) add('cao', 'Tab Đã giao/Thành viên', `Thiếu [data-tab] cho: ${missing.join(', ')}`);
        for (const t of ['delivered', 'members', 'orders']) {
          if (!tabs.includes(t)) continue;
          await page.evaluate(t => document.querySelector(`[data-tab="${t}"]`).click(), t);
          await page.waitForTimeout(400);
          const shown = await page.evaluate(t => { const s = document.getElementById('tab-' + t); return !!s && !s.classList.contains('hidden'); }, t);
          mark('Tab Đã giao/Thành viên', shown);
          if (!shown) add('cao', 'Tab Đã giao/Thành viên', `#tab-${t} không hiện sau khi bấm [data-tab="${t}"]`);
        }
      } catch (e) { mark('Tab Đã giao/Thành viên', false); add('cao', 'Tab Đã giao/Thành viên', `Lỗi: ${errMsg(e)}`); }
    }
  } catch (e) {
    add('cao', 'load', `Không tải được trang: ${errMsg(e)}`);
    mark('Tải trang', false);
  }
  mark('Không lỗi console', !issues.some(i => i.check === 'console' || i.check === 'pageerror'));
  mark('Không 404', !issues.some(i => i.check === '404' || i.check === 'request'));
  await context.close();
  return result;
}

// Đo LCP có giới hạn mạng (gần đúng 4G chậm) cho trang chủ
async function throttledLcp(browser, origin, [w, h]) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w <= MOBILE_MAX, hasTouch: w <= MOBILE_MAX });
  await setupRoutes(context, origin, new Set());
  await context.addInitScript(LCP_INIT);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  let bytes = 0;
  page.on('response', async r => { if (r.url().startsWith(origin)) try { bytes += (await r.body()).length; } catch {} });
  const t0 = Date.now();
  await page.goto(origin + '/index.html', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  const loadMs = Date.now() - t0;
  await page.waitForTimeout(1500);
  const lcp = await page.evaluate(() => window.__lcp).catch(() => null);
  await context.close();
  return { w, lcp, loadMs, bytes };
}

const errMsg = e => { const ls = String(e.message || e).split('\n'); const hit = ls.find(l => /intercepts pointer|not visible|outside of the viewport|not stable/.test(l)); return ls[0] + (hit ? ' — ' + hit.trim() : ''); };
const kb = b => (b / 1024).toFixed(0) + ' KB';

async function main() {
  const server = await startServer();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const executablePath = findChrome();
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
  console.log(`Server ${origin}  chrome=${executablePath || '(mặc định)'}  out=${OUT}`);
  const only = process.env.ONLY_PAGE ? [process.env.ONLY_PAGE] : PAGES;
  const results = [];
  for (const p of only) for (const vp of VIEWPORTS) {
    const r = await runCase(browser, origin, p, vp);
    const fails = Object.entries(r.checks).filter(([, v]) => !v).map(([k]) => k);
    console.log(`${p.padEnd(15)} ${String(vp[0]).padStart(4)}  ${fails.length ? 'FAIL: ' + fails.join(', ') : 'PASS'}  (${r.issues.length} vấn đề)`);
    results.push(r);
  }
  const thr = [];
  if (only.includes('index.html')) for (const vp of [[390, 844], [1440, 900]]) thr.push(await throttledLcp(browser, origin, vp));
  await browser.close();
  server.close();

  // ---------- Báo cáo ----------
  const L = [];
  const now = new Date().toISOString().replace('T', ' ').slice(0, 16);
  L.push('# Báo cáo kiểm thử responsive – Cua Cô Thúy', '', `Chạy lúc ${now} UTC bằng \`node tools/test/responsive.mjs\` (Playwright + Chromium headless, Supabase stub, Google Fonts rỗng).`, '');
  L.push('## Kết quả theo trang × viewport', '');
  L.push('| Trang | ' + VIEWPORTS.map(v => v.join('×')).join(' | ') + ' |', '|---|' + VIEWPORTS.map(() => '---').join('|') + '|');
  for (const p of only) {
    const cells = VIEWPORTS.map(([w]) => {
      const r = results.find(x => x.page === p && x.w === w);
      const fails = Object.entries(r.checks).filter(([, v]) => !v).map(([k]) => k);
      return fails.length ? `**FAIL** (${fails.join(', ')})` : 'PASS';
    });
    L.push(`| ${p} | ${cells.join(' | ')} |`);
  }
  L.push('');
  const allChecks = [...new Set(results.flatMap(r => Object.keys(r.checks)))];
  L.push('### Chi tiết từng kiểm tra', '', '| Trang | VP | ' + allChecks.join(' | ') + ' |', '|---|---|' + allChecks.map(() => '---').join('|') + '|');
  for (const r of results) L.push(`| ${r.page} | ${r.w} | ` + allChecks.map(c => r.checks[c] === undefined ? '–' : r.checks[c] ? '✓' : '✗').join(' | ') + ' |');
  L.push('');

  const SEV = ['cao', 'trung bình', 'thấp'];
  const counts = Object.fromEntries(SEV.map(s => [s, 0]));
  // gộp vấn đề trùng nhau giữa các viewport
  const grouped = new Map();
  for (const r of results) for (const i of r.issues) {
    const key = `${i.sev}|${r.page}|${i.check}|${i.msg.replace(/\d+(?=px|×)/g, 'N').replace(/right=\d+/g, 'right=N').replace(/top=\d+/g, 'top=N')}`;
    if (!grouped.has(key)) grouped.set(key, { ...i, page: r.page, vps: [] });
    grouped.get(key).vps.push(r.w);
  }
  for (const g of grouped.values()) counts[g.sev]++;
  L.push('## Danh sách vấn đề', '', `Tổng (đã gộp trùng): cao ${counts['cao']}, trung bình ${counts['trung bình']}, thấp ${counts['thấp']}.`, '');
  for (const s of SEV) {
    const list = [...grouped.values()].filter(g => g.sev === s);
    if (!list.length) continue;
    L.push(`### Mức ${s}`, '');
    for (const g of list) L.push(`- [${g.page} @ ${[...new Set(g.vps)].join(',')}] **${g.check}**: ${g.msg.replace(/\|/g, '\\|')}`);
    L.push('');
  }
  const extAll = [...new Set(results.flatMap(r => [...r.ext]))];
  if (extAll.length) { L.push('### Request ra ngoài (đã chặn, trả rỗng)', '', ...extAll.map(u => `- ${u}`), ''); }

  L.push('## Hiệu năng trang chủ', '');
  L.push('| Viewport | Tải lần đầu (trước cuộn) | Tổng sau khi cuộn hết trang | LCP không giới hạn mạng | Phần tử LCP |', '|---|---|---|---|---|');
  for (const r of results.filter(r => r.page === 'index.html')) L.push(`| ${r.w}×${r.h} | ${kb(r.bytes.initial)} | ${kb(r.bytes.total)} | ${r.lcp ? Math.round(r.lcp.t) + ' ms' : '–'} | ${r.lcp?.el || '–'} |`);
  L.push('');
  if (thr.length) {
    L.push('LCP gần đúng với mạng giới hạn (1.6 Mbps, RTT 150 ms, CPU ×4 – kiểu 4G chậm):', '');
    L.push('| Viewport | LCP | Sự kiện load | Bytes đến load | Phần tử LCP |', '|---|---|---|---|---|');
    for (const t of thr) L.push(`| ${t.w} | ${t.lcp ? Math.round(t.lcp.t) + ' ms' : '–'} | ${t.loadMs} ms | ${kb(t.bytes)} | ${t.lcp?.el || '–'} |`);
    L.push('');
  }
  const r1440 = results.find(r => r.page === 'index.html' && r.w === 1440);
  if (r1440) { L.push('Dung lượng theo loại (1440, sau cuộn): ' + Object.entries(r1440.bytes.byType).sort((a, b) => b[1] - a[1]).map(([t, b]) => `${t} ${kb(b)}`).join(', '), ''); }

  L.push('## Ảnh chụp', '', `Thư mục: ${OUT}/ — \`<trang>-<rộng>.png\` (full page), \`index-390-menu.png\`, \`index-<390|1440>-lightbox.png\`.`, '');
  // Giữ lại mục nhận xét thủ công nếu có
  const reportPath = path.join(OUT, 'report.md');
  const manualFile = path.join(HERE, 'manual-notes.md');
  if (fs.existsSync(manualFile)) L.push(fs.readFileSync(manualFile, 'utf8'));
  fs.writeFileSync(reportPath, L.join('\n'));
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results.map(r => ({ ...r, ext: [...r.ext] })), null, 2));
  console.log(`\nBáo cáo: ${reportPath}  — vấn đề: cao ${counts['cao']}, TB ${counts['trung bình']}, thấp ${counts['thấp']}`);
  process.exitCode = counts['cao'] ? 1 : 0;
}
main().catch(e => { console.error(e); process.exit(2); });
