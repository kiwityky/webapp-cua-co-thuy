// Giỏ hàng lưu ở localStorage (key 'cua_cart'): [{product_id, name, price, unit, quantity}]
// Mỗi thay đổi phát sự kiện 'cart:change' trên window (detail = giỏ hiện tại).
const KEY = 'cua_cart';
let memory = []; // dự phòng khi localStorage bị chặn

const clean = (list) => (Array.isArray(list) ? list : [])
  .filter((i) => i && i.product_id != null && Number(i.quantity) > 0)
  .map((i) => ({
    product_id: Number(i.product_id),
    name: String(i.name ?? ''),
    price: Number(i.price) || 0,
    unit: String(i.unit || 'kg'),
    quantity: Math.round(Number(i.quantity) * 10) / 10,
  }));

export function get() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw != null) return clean(JSON.parse(raw));
  } catch { /* localStorage bị chặn hoặc dữ liệu hỏng */ }
  return clean(memory);
}

function save(list) {
  const data = clean(list);
  memory = data;
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* bỏ qua */ }
  emit(data);
  return data;
}

function emit(data = get()) {
  try { window.dispatchEvent(new CustomEvent('cart:change', { detail: data })); } catch { /* bỏ qua */ }
}

// Thêm sản phẩm (mặc định 1 kg); cộng dồn nếu đã có
export function add(product, quantity = 1) {
  if (!product || product.id == null && product.product_id == null) return get();
  const id = Number(product.product_id ?? product.id);
  const q = Number(quantity) > 0 ? Number(quantity) : 1;
  const list = get();
  const found = list.find((i) => i.product_id === id);
  if (found) {
    found.quantity = Math.min(100, found.quantity + q);
    Object.assign(found, { name: product.name ?? found.name, price: product.price ?? found.price, unit: product.unit || found.unit });
  } else {
    list.push({ product_id: id, name: product.name, price: product.price, unit: product.unit || 'kg', quantity: q });
  }
  return save(list);
}

// Đặt lại số lượng một dòng (≤ 0 thì xoá)
export function setQty(productId, quantity) {
  const id = Number(productId);
  const q = Math.min(100, Number(quantity) || 0);
  const list = get().map((i) => (i.product_id === id ? { ...i, quantity: q } : i));
  return save(list);
}

export function remove(productId) {
  const id = Number(productId);
  return save(get().filter((i) => i.product_id !== id));
}

export function clear() {
  memory = [];
  try { localStorage.removeItem(KEY); } catch { /* bỏ qua */ }
  emit([]);
  return [];
}

// Số loại cua trong giỏ
export const count = () => get().length;

export const total = () => get().reduce((s, i) => s + Math.round(i.price * i.quantity), 0);

// Gắn số lượng giỏ vào phần tử (mặc định #cartCount), tự cập nhật khi giỏ đổi (kể cả ở tab khác)
export function bindCount(el = document.getElementById('cartCount')) {
  if (!el) return;
  const paint = () => {
    const n = count();
    el.textContent = String(n);
    el.hidden = false;
    el.dataset.count = String(n);
    const btn = el.closest('.cart-btn');
    if (btn) btn.setAttribute('aria-label', `Giỏ hàng: ${n} loại cua`);
  };
  paint();
  window.addEventListener('cart:change', paint);
  window.addEventListener('storage', (e) => { if (e.key === KEY || e.key === null) paint(); });
}
