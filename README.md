# Cua Cô Thúy – Webapp bán hàng & quản lý đơn

Một web gồm 3 khu, dùng chung một nguồn dữ liệu:

| Trang | Ai dùng | Chức năng |
|---|---|---|
| `index.html` | Khách vãng lai | Quảng bá, bảng giá (lấy từ CSDL), nút Zalo/gọi điện |
| `tai-khoan.html` | Khách thành viên | Đăng ký/đăng nhập, đặt hàng, xem đơn của mình, xem **điểm thành viên** (sau khi nhân viên gắn tài khoản) |
| `quan-ly.html` | Nhân viên công ty | Xem **tất cả** đơn (tên, SĐT, địa chỉ, số lượng, ghi chú), đổi trạng thái (đơn Đã giao sang tab riêng), quản lý **thành viên**, sửa đơn, theo dõi thanh toán (COD / chuyển khoản, đã thu hay chưa), tạo đơn hộ khách gọi Zalo, sửa giá; admin cấp quyền nhân viên |

Công nghệ: HTML/CSS/JS thuần (ES module, không cần build) + **Supabase** (Postgres, Auth, Realtime).
Hosting: **GitHub Pages** (repo `kiwityky/webapp-cua-co-thuy`), tên miền riêng **https://cuacothuy.shop** (file `CNAME`).

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

## Giá bán (giá vốn + % lãi)
- Nhân viên nhập **giá vốn** (giá mua vào) và **% lãi** ở tab **Sản phẩm**. Giá bán = giá vốn × (1 + % lãi), **làm tròn lên** bội số 10.000đ. CSDL tự tính (hàm `calc_sell_price`) và lưu vào `products.price`.
- % lãi mặc định: Cua don 15%, Cua tứ 16%, Y3 17%, Y5 18%, Y7 19%, Cua gạch 20%.
- Giá vốn lưu ở bảng `product_costs`, chỉ nhân viên xem được. Khách chỉ thấy giá bán.
- Bảng giá trang chủ, thẻ sản phẩm và đơn mới đều dùng giá bán này. Bảng giá ghi "Giá áp dụng từ" theo lần đổi giá gần nhất.
- Khi **Sửa đơn**, nhân viên sửa được giá bán (đ/kg) của từng dòng cho khớp thực tế.
- Lần đầu chạy, giá vốn được suy ngược từ giá bán cũ (để giá không đổi). Nhân viên nhập lại giá vốn thật rồi bấm Lưu.

## Ảnh sản phẩm và tải ảnh bảng giá
- Tab **Sản phẩm** có cột **Ảnh**: chọn ảnh hiện trên trang chủ cho từng loại cua (ảnh lấy từ `js/images.js`). Để "Tự động" thì: loại cũ dùng ảnh mặc định theo tên, loại mới có chữ "gạch" dùng ảnh gạch son, loại khác hiện logo. Ảnh nào tải lỗi cũng tự thay bằng logo, không để ô trống.
- Cần chạy lại **toàn bộ** `supabase/schema.sql` (thêm cột `products.image`) thì cột Ảnh mới chọn được; chưa chạy thì ô chọn bị khóa, trang chủ vẫn hiện ảnh tự động.
- Dưới bảng giá trang chủ có nút **Tải ảnh bảng giá**: tạo ảnh PNG (khổ 1240px) của bảng giá đang hiện, có ngày áp dụng. Trên điện thoại sẽ mở bảng chia sẻ để lưu ảnh hoặc gửi Zalo; máy tính thì tải file `bang-gia-cua-co-thuy-<ngày>.png`.

## Cập nhật từ bản cũ
Nếu đã chạy bản cũ (điểm lưu trong tài khoản khách), cần chạy lại **toàn bộ** `supabase/schema.sql` trong SQL Editor. Chạy lại an toàn, không mất đơn hay sản phẩm: file tự tạo thành viên từ các đơn đã giao trước đó và tính lại điểm cho từng thành viên. Cột điểm cũ trong `profiles` bị bỏ. Sau đó, vào tab **Thành viên** gắn email cho những khách đã có tài khoản để họ thấy lại điểm.

## 1. Tạo Supabase (miễn phí)
1. Vào https://supabase.com → New project (chọn region Singapore).
2. **SQL Editor** → dán toàn bộ `supabase/schema.sql` → Run.
3. **Authentication → Sign In / Providers → Email**: bật Email. Muốn khách đăng ký xong dùng ngay thì tắt *Confirm email*.
4. **Authentication → URL Configuration**: Site URL = `https://cuacothuy.shop`; Redirect URLs thêm `https://cuacothuy.shop/**` và `https://www.cuacothuy.shop/**`.
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
Vài phút sau web chạy ở `https://cuacothuy.shop` (file `CNAME` đã khai báo tên miền).

Lưu ý:
- Gói GitHub miễn phí chỉ bật Pages cho **repo public**, nên mọi file trong repo ai cũng xem được. Chỉ để code ở đây, **tuyệt đối không commit dữ liệu khách hàng** hay `service_role` key.
- `anon key` trong `js/config.js` công khai được **chỉ vì** mọi bảng đã bật Row Level Security. Không tắt RLS.
- Tên miền `cuacothuy.shop` (mua ở Porkbun): DNS gồm 4 bản ghi A cho `@` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` và CNAME `www` → `kiwityky.github.io`. Ở Settings → Pages → Custom domain nhập `cuacothuy.shop`, bật *Enforce HTTPS*. Không xóa file `CNAME`.
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
js/pricing.js       công thức giá bán (xem trước ở trang quản lý)
js/price-board.js   bảng giá HTML trên trang chủ
css/style.css
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
`node tools/test/bang-gia.mjs` kiểm thử bảng giá, tab Sản phẩm và sửa giá trong đơn.
`node tools/test/responsive.mjs` chụp 3 trang ở 5 kích thước màn hình và kiểm tra cuộn ngang, ảnh lỗi, nút bấm (cần Playwright + Chromium).
