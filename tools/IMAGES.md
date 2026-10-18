## Cập nhật ảnh

Ảnh web nằm trong `assets/img/` và được tạo từ ảnh gốc bằng `tools/build-images.py`
(xoay theo EXIF, cắt watermark điện thoại, xoá metadata, xuất `-480.webp`, `-960.webp`,
`-960.jpg`, ảnh hero thêm `-1600`, và `og.jpg` 1200x630 cho chia sẻ Facebook/Zalo).

**1. Cài Pillow (chỉ lần đầu)** – mở Command Prompt:

```
pip install Pillow
```

(Nếu báo không có `pip`, dùng `py -m pip install Pillow`.)

**2. Chạy script** – từ thư mục `CUA\webapp`:

```
cd CUA\webapp
python tools\build-images.py ..\images\161026
```

Không ghi đường dẫn thì mặc định là `..\images\161026`. Script ghi đè file trong
`assets\img\` và in bảng tên file, kích thước, dung lượng.

**3. Thêm ảnh mới**

1. Chép ảnh gốc vào thư mục ảnh (ví dụ `CUA\images\161026`).
2. Mở `tools\build-images.py`, thêm một dòng vào `IMAGE_MAP`. Khoá là phần đầu tên file gốc:
   ```python
   "1792026589300": {"name": "cua-gach-moi"},
   # ảnh có chữ watermark ở đáy: thêm "crop_bottom": 0.10 (cắt 10% chiều cao)
   ```
   Tên `name`: chữ thường không dấu, nối bằng gạch ngang.
3. Chạy lại script (bước 2). Cuối bảng có dòng
   `'cua-gach-moi': { alt: '...', w: ..., h: ..., w480: ... }`.
4. Dán dòng đó vào `IMAGES` trong `js/images.js`, sửa `alt` thành mô tả tiếng Việt đúng nội dung ảnh.
   Muốn hiện trong thư viện thì thêm tên vào `GALLERY`. Muốn gán cho sản phẩm thì sửa
   `PRODUCT_IMAGES` (khoá là đúng tên sản phẩm, ví dụ `'Cua Y5'`).
5. Commit cả ảnh trong `assets/img/` lẫn `js/images.js`.
