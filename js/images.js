// Ảnh sản phẩm / thư viện – Cua Cô Thúy.
// File ảnh do tools/build-images.py tạo trong assets/img/:
//   <name>-480.webp, <name>-960.webp, <name>-960.jpg (hero thêm -1600.webp/.jpg), og.jpg
// w/h = kích thước thật của bản 960; w480/w1600 = chiều rộng thật của bản 480/1600
// (ảnh gốc nhỏ nên không phóng to; srcset dùng đúng chiều rộng thật).

const DIR = 'assets/img/';

export const IMAGES = {
  'thit-chac':        { alt: 'Hai nửa cua luộc trên tay, thịt trắng chắc lẫn gạch vàng', w: 720, h: 864, w480: 480 },
  'gach-vang':        { alt: 'Mai cua luộc đầy gạch vàng óng', w: 960, h: 720, w480: 480 },
  'cang-chac':        { alt: 'Càng cua luộc bóc lớp vỏ, lộ thịt càng trắng chắc', w: 720, h: 864, w480: 480 },
  'gach-son-dia':     { alt: 'Miếng cua gạch son đỏ cầm trên dĩa cua luộc', w: 512, h: 960, w480: 341 },
  'mai-gach-son':     { alt: 'Càng cua luộc to, vỏ đỏ nứt lộ thịt bên trong', w: 720, h: 960, w480: 480 },
  'gach-son-dia-2':   { alt: 'Dĩa cua gạch luộc, gạch son đỏ và gạch xanh đầy ắp', w: 718, h: 864, w480: 480 },
  'gach-son-do':      { alt: 'Cận cảnh thân cua luộc đầy gạch son đỏ cam', w: 720, h: 960, w480: 480 },
  'mai-cua-gach':     { alt: 'Thau mai cua đầy gạch vàng', w: 800, h: 960, w480: 480 },
  'cua-song-day-rut': { alt: 'Cua biển Năm Căn sống, buộc dây rút, còn tươi xanh', w: 720, h: 1280, w480: 360, w1600: 900 },
};

// Khớp theo products.name (xem supabase/schema.sql)
export const PRODUCT_IMAGES = {
  'Cua don': 'cua-song-day-rut',
  'Cua dơn': 'cua-song-day-rut', // tên cũ, giữ cho DB chưa chạy lại schema
  'Cua tứ': 'gach-vang',
  'Cua Y3': 'thit-chac',
  'Cua Y5': 'cang-chac',
  'Cua Y7': 'mai-gach-son',
  'Cua gạch': 'gach-son-dia-2',
};

// Thứ tự hiển thị thư viện ảnh
export const GALLERY = [
  'cua-song-day-rut',
  'gach-son-dia-2',
  'gach-vang',
  'cang-chac',
  'gach-son-do',
  'thit-chac',
  'mai-cua-gach',
  'mai-gach-son',
  'gach-son-dia',
];

export function imgUrl(name, size = 960, ext = 'jpg') {
  return `${DIR}${name}-${size}.${ext}`;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/**
 * Trả chuỗi HTML <picture> (webp srcset + jpg fallback).
 * size1600: true để thêm bản 1600 (chỉ ảnh có w1600, ví dụ hero).
 * alt: ghi đè alt mặc định ('' cho ảnh trang trí).
 */
export function picture(name, {
  sizes = '(max-width:600px) 100vw, 480px',
  eager = false,
  cls = '',
  size1600 = false,
  alt,
} = {}) {
  const im = IMAGES[name];
  if (!im) return '';
  const big = size1600 && im.w1600;
  const webp = [
    `${imgUrl(name, 480, 'webp')} ${im.w480}w`,
    `${imgUrl(name, 960, 'webp')} ${im.w}w`,
    big ? `${imgUrl(name, 1600, 'webp')} ${im.w1600}w` : '',
  ].filter(Boolean).join(', ');
  const jpg = big
    ? ` srcset="${imgUrl(name, 960, 'jpg')} ${im.w}w, ${imgUrl(name, 1600, 'jpg')} ${im.w1600}w" sizes="${esc(sizes)}"`
    : '';
  const altText = alt === undefined ? im.alt : alt;
  const load = eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"';
  return `<picture${cls ? ` class="${esc(cls)}"` : ''}>`
    + `<source type="image/webp" srcset="${webp}" sizes="${esc(sizes)}">`
    + `<img src="${imgUrl(name, 960, 'jpg')}"${jpg} alt="${esc(altText)}" width="${im.w}" height="${im.h}" ${load} decoding="async">`
    + `</picture>`;
}
