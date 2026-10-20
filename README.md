# Cua Cô Thúy – Webapp bán hàng & quản lý đơn

Một web gồm 3 khu, dùng chung một nguồn dữ liệu:

| Trang | Ai dùng | Chức năng |
|---|---|---|
| `index.html` | Khách vãng lai | Quảng bá, bảng giá (lấy từ CSDL), nút Zalo/gọi điện |
| `tai-khoan.html` | Khách thành viên | Đăng ký/đăng nhập, đặt hàng, xem đơn của mình, xem **điểm thành viên** (sau khi nhân viên gắn tài khoản) |
| `quan-ly.html` | Nhân viên công ty | Xem **tất cả** đơn (tên, SĐT, địa chỉ, số lượng, ghi chú), đổi trạng thái (đơn Đã giao sang tab riêng), quản lý **thành viên**, sửa đơn, theo dõi thanh toán (COD / chuyển khoản, đã thu hay chưa), tạo đơn hộ khách gọi Zalo, sửa giá; admin cấp quyền nhân viên |

Công nghệ: HTML/CSS/JS thuần (ES module, không cần build) + **Supabase** (Postgres, Auth, Realtime).
Hosting: **GitHub Pages** (miễn phí, tên miền `ten-ban.github.io`).

## Phân quyền (bảo mật nằm ở CSDL, không chỉ ở giao diện)
- Khách: chỉ đọc được đơn của chính mình (Row Level Security).
- Nhân viên/Admin: đọc và cập nhật mọi đơn; đơn mới hiện ngay nhờ Realtime.
- Đơn chỉ tạo qua hàm `create_order`: giá luôn lấy từ bảng `products`, khách không sửa giá được.
- Điểm nằm ở bảng `members` (thành viên theo số điện thoại), không nằm ở tài khoản đăng nhập. Khách đăng nhập chỉ đọc được dòng thành viên đã gắn với tài khoản của mình; nhân viên/admin đọc được tất cả. Xem mục *Thành viên và tích điểm* bên dưới.
- Đơn nhân viên đặt hộ tự gắn vào tài khoản khách nếu trùng số điện thoại.

## Thành viên và tích điểm
- Khi nhân viên chuyển đơn sang **Đã giao**, đơn tự chuyển sang tab **Đã giao**, khách được lưu thành **thành viên** theo số điện thoại (kèm tên, địa chỉ) và được cộng điểm tự động: `floor(tổng tiền / vnd_per_point)`, mặc định 10.000đ = 1 điểm.
- Để khách đăng nhập xem được điểm và lịch sử đơn, nhân viên vào tab **Thành viên**, chọn thành viên rồi gắn tài khoản bằng **email** khách đã đăng ký. Khách đăng nhập `tai-khoan.html` sẽ thấy huy hiệu thành viên, điểm hiện có, số đơn, tổng tiền đã mua. Khách chưa được gắn tài khoản vẫn được tích điểm bình thường, chỉ là chưa tự xem được.
- Đổi trạng thái đơn ngược lại (từ Đã giao về trạng thái khác) thì điểm, tổng tiền và số đơn tự hoàn lại; thông tin thành viên vẫn được giữ.
- Đổi tỉ lệ điểm (số đồng cho 1 điểm) ở tab **Nhân viên** (chỉ admin). Tỉ lệ mới áp dụng cho các đơn giao sau đó.

## Cập nhật từ bản cũ
Nếu đã chạy bản cũ (điểm lưu trong tài khoản khách), cần chạy lại **toàn bộ** `supabase/schema.sql` trong SQL Editor. Chạy lại an toàn, không mất đơn hay sản phẩm: file tự tạo thành viên từ các đơn đã giao trước đó và tính lại điểm cho từng thành viên. Cột điểm cũ trong `profiles` bị bỏ. Sau đó, vào tab **Thành viên** gắn email cho những khách đã có tài khoản để họ thấy lại điểm.

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
js/config.js        URL + anon key Supabase, thông tin shop, tài khoản ngân hàng (SHOP.bank) hiện khi khách chọn chuyển khoản
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
