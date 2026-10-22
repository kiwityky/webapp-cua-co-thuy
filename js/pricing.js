// Công thức giá bán – khớp hàm calc_sell_price trong supabase/schema.sql:
//   giá bán = giá vốn × (1 + % lãi), làm tròn LÊN bội số 10.000đ.
// Giá bán thật do CSDL tính và lưu ở products.price; hàm này chỉ để xem trước ở trang quản lý.
export const ROUND_TO = 10000;

export function calcSellPrice(cost, pct) {
  const c = Math.max(0, Math.round(Number(cost) || 0));
  const m = Math.round((100 + (Number(pct) || 0)) * 100); // (100 + %) × 100, số nguyên để tránh sai số
  return Math.ceil((c * m) / (100 * 100 * ROUND_TO)) * ROUND_TO;
}

// Giá bán đang áp dụng của một sản phẩm
export function sellPrice(p) {
  return Number(p?.price) || 0;
}
