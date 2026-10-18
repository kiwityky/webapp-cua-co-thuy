## Nhận xét trực quan (xem ảnh chụp index 360 / 390 / 768 / 1440)

Ghi tay ngày 18/10/2026 sau khi xem ảnh chụp. Script tự chèn file `tools/test/manual-notes.md` vào cuối báo cáo, nên cập nhật file đó nếu giao diện đổi.

**Ổn:**
- Không có chữ tràn hay chồng lấn ở 360/390. Topbar ở mobile ẩn dòng "Cua Năm Căn · Đầm Dơi", chỉ giữ Hotline + Zalo, vẫn gọn trên một dòng.
- Hero mobile có lớp phủ tối đủ đậm, chữ trắng đọc rõ, 2 CTA rộng hết hàng và cao khoảng 48px. Ở desktop, ảnh nằm bên phải (48%) và chữ trên nền navy đặc nên tương phản tốt.
- Thẻ sản phẩm có ảnh 4:3 với object-fit:cover, không bị méo. Giá màu đỏ đậm, tương phản tốt. Badge "Cao cấp"/"Đặc biệt" đọc được.
- Menu mobile (index-390-menu.png) mở dạng tấm phủ navy, mỗi mục cao ít nhất 40px, nút X rõ. Toast "Đã thêm…" nằm trên thanh hành động, không bị che.
- Thanh hành động đáy (Gọi ngay / Zalo / Đặt hàng) cao 64px. Body có padding-bottom nên dòng © cuối trang không bị che.
- Chữ phụ (#5f6f7f trên #f7fafc/#e8f2fa, khoảng 4.9:1) và chữ footer (#9fb8cf trên navy) đều đạt tương phản AA.

**Cần cải thiện:**
1. Trang chủ ở mobile rất dài: khoảng 7.250px ở 360 và 7.450px ở 390. Lý do là 6 thẻ sản phẩm xếp 1 cột, mỗi thẻ khoảng 450px. Người dùng phải cuộn khoảng 2.700px mới hết sản phẩm.
2. Gallery có 9 ảnh nhưng hàng cuối bị lẻ. Ở 1440, lưới auto-fill 5 cột cho ra 5+4. Ở mobile 2 cột thì ảnh thứ 9 nằm một mình.
3. Ở tablet (768) và laptop nhỏ (1024), nút nổi Gọi ngay/Zalo khá to (khoảng 130×48px). Khi cuộn, chúng che tạm thời nút "Thêm vào giỏ" ở cột phải và ảnh gallery (xem mục "Action-bar che giữa trang").
4. Trên mạng 4G chậm, LCP ở mobile khoảng 1.5s, chấp nhận được. Riêng ảnh bảng giá `assets/bang-gia.png` nặng 757 KB (1080×1920) nhưng chỉ hiển thị tối đa 520px. Đây là tài nguyên nặng nhất trang, chiếm gần nửa tổng dung lượng.
5. Lightbox và ảnh preload kế tiếp dùng bản `-960.jpg` thay vì webp, nên mỗi lần mở tải thêm khoảng 30–60 KB so với webp.
6. Ghi chú về kiểm thử: trong ảnh chụp full-page, thanh hành động cố định và header sticky xuất hiện ở vị trí của viewport đầu tiên. Đó là đặc tính của ảnh chụp toàn trang, không phải lỗi. Font Google bị chặn trong môi trường test nên tiêu đề hiển thị bằng font serif dự phòng thay cho Playfair Display. Trong `index-1024.png`/`index-1440.png`, ảnh thẻ "Cua dơn" có lúc hiện ô trống màu sky. Kiểm tra lại bằng ảnh chụp viewport thì ảnh vẫn hiển thị bình thường (naturalWidth=360, currentSrc=`cua-song-day-rut-480.webp`), nên đây là lỗi raster của ảnh chụp full-page trong Chromium headless, không phải lỗi trang.

## Đề xuất sửa

| # | Ai sửa | Selector / vị trí | Đề xuất |
|---|---|---|---|
| 1 | Tác vụ 2 (ảnh) + Tác vụ 1 (index.html) | `img.pricelist` / `assets/bang-gia.png` | Xuất `bang-gia-520.webp` + `bang-gia-1040.webp` (khoảng 60–150 KB) rồi dùng `<picture><source type="image/webp" srcset="assets/bang-gia-520.webp 520w, assets/bang-gia-1040.webp 1040w" sizes="(max-width:600px) calc(100vw - 32px), 520px"><img class="pricelist" src="assets/bang-gia.png" width="1080" height="1920" loading="lazy" …></picture>`. Thêm `width`/`height` để tránh CLS. Ước tính giảm khoảng 600 KB. |
| 2 | Tác vụ 1 (css) | `@media (max-width:600px) .product-grid` | Rút ngắn trang: hoặc dùng `.product-media{aspect-ratio:16/10}` trên mobile, hoặc làm thẻ ngang: `.product-card{display:grid;grid-template-columns:120px 1fr}` `.product-media{aspect-ratio:1/1;height:100%}` `.product-body{padding:12px}` `.add-cart{min-height:44px}`. |
| 3 | Tác vụ 1 (css) | `.gallery` | Desktop: `grid-template-columns:repeat(3,1fr)` (9 ảnh = 3×3), có thể kèm `max-width:960px;margin-inline:auto`. Mobile ≤600: `grid-template-columns:repeat(3,1fr);gap:6px` (3×3), hoặc giữ 2 cột và thêm `.gallery-item:first-child{grid-column:span 2;aspect-ratio:2/1}` để chẵn hàng. |
| 4 | Tác vụ 1 (css) | `@media (max-width:960px) and (min-width:601px) .action-bar a` | Thu nhỏ nút nổi ở tablet thành nút tròn chỉ có icon: `.action-bar a{width:52px;height:52px;padding:0;justify-content:center;font-size:0}` `.action-bar a svg{width:22px;height:22px}` (giữ `aria-label`). Cách khác là dùng thanh đáy cho cả ≤960px. |
| 5 | Tác vụ 3 (js/home.js) | dòng `img.src = IMG.imgUrl(n, 960, 'jpg')` và preload | Dùng `IMG.imgUrl(n, 960, 'webp')`, vì mọi trình duyệt hỗ trợ `<dialog>` đều hỗ trợ webp. |
| 6 | Tác vụ 1 (index.html) | `<head>` | Thêm `<link rel="preload" as="image" type="image/webp" imagesrcset="assets/img/cua-song-day-rut-480.webp 360w, assets/img/cua-song-day-rut-960.webp 720w, assets/img/cua-song-day-rut-1600.webp 900w" imagesizes="(max-width:960px) 100vw, 46vw" fetchpriority="high">` để ảnh hero (phần tử LCP) bắt đầu tải trước CSS/JS. |
| 7 | Tác vụ 1 (index.html) | `.hero-bg source` sizes | Ở 961–1440px, ảnh hero chiếm 48% (≈ 690px ở 1440) nhưng `sizes` khai báo 46vw. Nên sửa thành `48vw` cho khớp CSS (thay đổi nhỏ, giúp chọn đúng bản 960/1600 trên màn hình DPR 2). |
