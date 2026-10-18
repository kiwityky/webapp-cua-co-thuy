import { sb, esc, money, toast, $ } from './common.js';

// Form tạo đơn dùng chung cho khách (tự đặt) và nhân viên (đặt hộ)
export function renderOrderForm(root, products, defaults = {}, onCreated) {
  if (!root) return;
  defaults = defaults || {};
  const opts = products.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} – ${money(p.price)}/${esc(p.unit)}</option>`).join('');
  root.innerHTML = `
    <form class="card" id="orderForm">
      <h3>${esc(defaults.title || 'Đặt hàng')}</h3>
      <label>Tên người nhận<input name="name" required value="${esc(defaults.full_name)}"></label>
      <label>Số điện thoại<input name="phone" required inputmode="tel" value="${esc(defaults.phone)}"></label>
      <label>Địa chỉ giao<textarea name="address" required>${esc(defaults.address)}</textarea></label>
      <div id="lines"></div>
      <button type="button" class="btn small" id="addLine">+ Thêm loại cua</button>
      <label style="margin-top:10px">Thời gian giao<input name="delivery_time" maxlength="100" placeholder="VD: 9h sáng 19/10, chiều mai, càng sớm càng tốt"></label>
      <label>Ghi chú<textarea name="note" placeholder="Yêu cầu buộc dây, gọi trước khi giao, ..."></textarea></label>
      <div class="row" style="justify-content:space-between">
        <b>Tạm tính: <span id="sum">0đ</span></b>
        <button class="btn btn-red primary" type="submit">Gửi đơn</button>
      </div>
    </form>`;
  const form = $('#orderForm', root), lines = $('#lines', root);
  const priceOf = (id) => products.find((p) => p.id == id)?.price || 0;
  const recalc = () => {
    let s = 0;
    lines.querySelectorAll('.item-line').forEach((l) =>
      s += priceOf($('select', l).value) * (parseFloat($('input', l).value) || 0));
    $('#sum', root).textContent = money(Math.round(s));
  };
  const addLine = (item) => {
    const d = document.createElement('div');
    d.className = 'item-line';
    d.innerHTML = `<label>Loại cua<select>${opts}</select></label>
      <label>Số kg<input type="number" min="0.5" step="0.5" value="1"></label>
      <button type="button" class="btn small" title="Xóa" aria-label="Xóa dòng">×</button>`;
    if (item) {
      $('select', d).value = String(item.product_id);
      const q = parseFloat(item.quantity);
      if (q > 0) $('input', d).value = String(q);
    }
    $('button', d).onclick = () => { d.remove(); recalc(); };
    d.oninput = recalc;
    lines.append(d);
    recalc();
  };
  $('#addLine', root).onclick = () => addLine();
  // defaults.items (vd. từ giỏ hàng): [{product_id, quantity}] → tạo sẵn các dòng
  const preset = (Array.isArray(defaults.items) ? defaults.items : [])
    .filter((i) => i && products.some((p) => p.id == i.product_id));
  if (preset.length) preset.forEach(addLine);
  else addLine();

  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const items = [...lines.querySelectorAll('.item-line')].map((l) => ({
      product_id: Number($('select', l).value), quantity: parseFloat($('input', l).value),
    })).filter((i) => i.quantity > 0);
    if (!items.length) return toast('Chưa chọn sản phẩm', true);
    const btn = $('button[type=submit]', form);
    if (!sb) return toast('Hệ thống đặt hàng online đang được cài đặt, vui lòng nhắn Zalo.', true);
    btn.disabled = true;
    let data, error;
    try {
      ({ data, error } = await sb.rpc('create_order', {
        p_customer_name: f.name, p_phone: f.phone, p_address: f.address,
        p_note: f.note || null, p_items: items, p_delivery_time: f.delivery_time || null,
      }));
    } catch (err) {
      error = err;
    }
    btn.disabled = false;
    if (error) return toast(error.message || 'Lỗi kết nối, vui lòng thử lại', true);
    toast(`Đã tạo đơn #${data}`);
    onCreated?.(data);
  };
}
