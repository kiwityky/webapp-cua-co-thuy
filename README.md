# Cua Cô Thúy – Webapp bán hàng & quản lý đơn

Một web gồm 3 khu, dùng chung một nguồn dữ liệu:

| Trang | Ai dùng | Chức năng |
|---|---|---|
| `index.html` | Khách vãng lai | Quảng bá, bảng giá (lấy từ CSDL), nút Zalo/gọi điện |
| `tai-khoan.html` | Khách thành viên | Đăng ký/đăng nhập, đặt hàng, xem đơn của mình, **tích điểm** |
| `quan-ly.html` | Nhân viên công ty | Xem **tất cả** đơn (tên, SĐT, địa chỉ, số lượng, ghi chú), đổi trạng thái, ghi chú nội bộ, tạo đơn hộ khách gọi Zalo, sửa giá; admin cấp quyền nhân viên |

Công nghệ: HTML/CSS/JS thuần (ES module, không cần build) + **Supabase** (Postgres, Auth, Realtime).
Hosting: **GitHub Pages** (miễn phí, tên miền `ten-ban.github.io`).

## Phân quyền (bảo mật nằm ở CSDL, không chỉ ở giao diện)
- Khách: chỉ đọc được đơn của chính mình (Row Level Security).
- Nhân viên/Admin: đọc và cập nhật mọi đơn; đơn mới hiện ngay nhờ Realtime.
- Đơn chỉ tạo qua hàm `create_order`: giá luôn lấy từ bảng `products`, khách không sửa giá được.
- Điểm: khi đơn chuyển sang **Đã giao**, khách được cộng `floor(tổng tiền / vnd_per_point)` điểm (mặc định 10.000đ = 1 điểm, admin đổi được). Đổi trạng thái ngược lại thì điểm bị trừ lại.
- Đơn nhân viên đặt hộ tự gắn vào tài khoản khách nếu trùng số điện thoại.

## 1. Tạo Supabase (miễn phí)
1. Vào https://supabase.com → New project (chọn region Singapore).
2. **SQL Editor** → dán toàn bộ `supabase/schema.sql` → Run.
3. **Authentication → Sign In / Providers → Email**: bật Email. Muốn khách đăng ký xong dùng ngay thì tắt *Confirm email*.
4. **Authentication → URL Configuration**: Site URL = `https://ten-ban.github.io/ten-repo/`.
5. **Project Settings → API**: chép *Project URL* và *anon public key* vào `js/config.js`.

## 2. Tạo admin đầu tiên
1. Mở `quan-ly.html` (hoặc `tai-khoan.html`), đăng ký tài khoản của anh.
2. Trong SQL Editor chạy:
   ```sql
   update profiles set role = 'admin'
   where id = (select id from auth.users where email = 'email-cua-anh@gmail.com');
   ```
3. Nhân viên tự đăng ký, sau đó admin vào **quan-ly.html → Nhân viên** nhập email để cấp quyền.

## 3. Đưa lên GitHub Pages
```bash
git init && git add . && git commit -m "Cua Co Thuy webapp"
git branch -M main
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```
GitHub → repo → **Settings → Pages** → Source: *Deploy from a branch*, Branch `main` / `(root)` → Save.
Vài phút sau web chạy ở `https://<user>.github.io/<repo>/`.

Lưu ý:
- Gói GitHub miễn phí chỉ bật Pages cho **repo public**, nên mọi file trong repo ai cũng xem được. Chỉ để code ở đây, **tuyệt đối không commit dữ liệu khách hàng** hay `service_role` key.
- `anon key` trong `js/config.js` công khai được **chỉ vì** mọi bảng đã bật Row Level Security. Không tắt RLS.
- Muốn tên miền riêng (vd. `cuacothuy.vn`): mua domain rồi khai báo ở Settings → Pages → Custom domain.
- Gói free của Supabase tạm dừng project nếu 7 ngày không có truy cập; vào dashboard bấm Restore là chạy lại.

## Chạy thử trên máy
```bash
python -m http.server 8000   # rồi mở http://localhost:8000
```
(Phải chạy qua server, mở file trực tiếp sẽ không tải được ES module.)

## Cấu trúc
```
index.html          trang quảng bá
tai-khoan.html      khu khách hàng
quan-ly.html        khu nhân viên
js/config.js        URL + anon key Supabase, thông tin shop
js/common.js        kết nối Supabase, đăng nhập, tiện ích
js/order-form.js    form đặt hàng dùng chung
css/style.css
assets/bang-gia.png
supabase/schema.sql bảng, hàm, RLS, dữ liệu giá ban đầu
```

## Cập nhật hình ảnh
Ảnh gốc để ở `CUA\images\161026` (cùng cấp với thư mục `webapp`). Sau khi thêm/đổi ảnh:
```bash
pip install Pillow            # lần đầu
python tools\build-images.py ..\images\161026
```
Chi tiết (đặt tên ảnh, gắn ảnh cho từng sản phẩm trong `js/images.js`): xem `tools/IMAGES.md`.

## Kiểm thử giao diện
`node tools/test/responsive.mjs` chụp 3 trang ở 5 kích thước màn hình và kiểm tra cuộn ngang, ảnh lỗi, nút bấm (cần Playwright + Chromium).
