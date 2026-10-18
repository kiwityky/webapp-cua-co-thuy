#!/usr/bin/env python3
"""Tạo ảnh web cho Cua Cô Thúy từ ảnh gốc.

Cách dùng (chạy từ thư mục webapp):
    python tools/build-images.py [THU_MUC_ANH_GOC] [--out assets/img]

Mặc định THU_MUC_ANH_GOC = ../images/161026 (tương đối với thư mục webapp).
Cần Pillow:  pip install Pillow

Với mỗi ảnh trong bảng IMAGE_MAP:
  - xoay đúng theo EXIF, chuyển sang RGB, xoá metadata
  - cắt bỏ dải đáy nếu có watermark (crop_bottom = tỉ lệ chiều cao)
  - xuất <name>-480.webp, <name>-960.webp, <name>-960.jpg
  - ảnh có hero=True xuất thêm <name>-1600.webp, <name>-1600.jpg
  - ảnh có og=True dùng để tạo og.jpg 1200x630 (og_center_y = tâm dọc 0..1)
Không phóng to ảnh nhỏ hơn kích thước đích (trừ og.jpg buộc phải đủ 1200x630).
"""
import argparse
import os
import sys

try:
    from PIL import Image, ImageOps, features
except ImportError:
    sys.exit("Chưa có Pillow. Cài bằng:  pip install Pillow")

# ---------------------------------------------------------------------------
# BẢNG MAP ẢNH – thêm ảnh mới ở đây.
# Khoá = đoạn đầu tên file gốc (file nào có tên bắt đầu bằng khoá sẽ được dùng).
#   name        : tên ảnh web (chữ thường, không dấu, nối bằng gạch ngang)
#   crop_bottom : tỉ lệ chiều cao cắt bỏ ở đáy (0 = không cắt; 0.10 = 10%)
#   hero        : True → xuất thêm bản 1600
#   og          : True → dùng làm ảnh og.jpg (chỉ một ảnh)
# Sau khi thêm ảnh mới nhớ khai báo alt/kích thước trong js/images.js
# (script in sẵn dòng IMAGES để dán vào).
# ---------------------------------------------------------------------------
IMAGE_MAP = {
    "1792026589137": {"name": "thit-chac", "crop_bottom": 0.10},
    "1792026589174": {"name": "gach-vang"},
    "1792026589194": {"name": "cang-chac", "crop_bottom": 0.10},
    "1792026589211": {"name": "gach-son-dia"},
    "1792026589225": {"name": "mai-gach-son"},
    "1792026589236": {"name": "gach-son-dia-2", "crop_bottom": 0.10},
    "1792026589245": {"name": "gach-son-do"},
    "1792026589256": {"name": "mai-cua-gach"},
    "1792026589266": {"name": "cua-song-day-rut", "hero": True, "og": True, "og_center_y": 0.42},
}

# (tên hậu tố, khung tối đa rộng x cao)
SIZES = [(480, (480, 640)), (960, (960, 1280))]
HERO_SIZE = (1600, (1600, 1600))
QUALITY = 78
OG_SIZE = (1200, 630)


def fit(im, box):
    """Thu nhỏ vừa khung box, giữ tỉ lệ, không phóng to."""
    bw, bh = box
    w, h = im.size
    scale = min(bw / w, bh / h, 1.0)
    if scale >= 1.0:
        return im.copy()
    return im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)


def save(im, path, fmt):
    if fmt == "webp":
        im.save(path, "WEBP", quality=QUALITY, method=6)
    else:
        im.save(path, "JPEG", quality=QUALITY, optimize=True, progressive=True)


def load(path, crop_bottom):
    im = Image.open(path)
    im = ImageOps.exif_transpose(im)
    im = im.convert("RGB")  # bỏ alpha/ICC/EXIF khi lưu
    if crop_bottom:
        w, h = im.size
        im = im.crop((0, 0, w, h - round(h * crop_bottom)))
    return im


def make_og(im, center_y, path):
    tw, th = OG_SIZE
    w, h = im.size
    scale = max(tw / w, th / h)
    big = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    bw, bh = big.size
    top = min(max(0, round(bh * center_y - th / 2)), bh - th)
    left = (bw - tw) // 2
    save(big.crop((left, top, left + tw, top + th)), path, "jpg")


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    webapp = os.path.dirname(here)
    ap = argparse.ArgumentParser(description="Tạo ảnh web cho Cua Cô Thúy")
    ap.add_argument("src", nargs="?", default=os.path.join(webapp, "..", "images", "161026"),
                    help="thư mục ảnh gốc (mặc định ../images/161026)")
    ap.add_argument("--out", default=os.path.join(webapp, "assets", "img"), help="thư mục xuất")
    args = ap.parse_args()

    src = os.path.abspath(args.src)
    out = os.path.abspath(args.out)
    if not os.path.isdir(src):
        sys.exit(f"Không thấy thư mục ảnh gốc: {src}")
    os.makedirs(out, exist_ok=True)

    webp_ok = features.check("webp")
    if not webp_ok:
        print("CẢNH BÁO: Pillow không hỗ trợ WebP – chỉ xuất JPG.")

    files = sorted(f for f in os.listdir(src) if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp")))
    rows, js_lines, missing = [], [], []
    for key, cfg in IMAGE_MAP.items():
        match = [f for f in files if f.startswith(key)]
        if not match:
            missing.append(key)
            continue
        name = cfg["name"]
        im = load(os.path.join(src, match[0]), cfg.get("crop_bottom", 0))
        sizes = SIZES + ([HERO_SIZE] if cfg.get("hero") else [])
        dims = {}
        for label, box in sizes:
            r = fit(im, box)
            dims[label] = r.size
            fmts = ["webp", "jpg"] if label != 480 else ["webp"]
            if not webp_ok:
                fmts = ["jpg"]
            for fmt in fmts:
                fn = f"{name}-{label}.{fmt}"
                p = os.path.join(out, fn)
                save(r, p, fmt)
                rows.append((fn, r.size, os.path.getsize(p)))
        w9, h9 = dims[960]
        extra = f", w480: {dims[480][0]}" + (f", w1600: {dims[1600][0]}" if 1600 in dims else "")
        js_lines.append(f"  '{name}': {{ alt: '...', w: {w9}, h: {h9}{extra} }},")
        if cfg.get("og"):
            p = os.path.join(out, "og.jpg")
            make_og(im, cfg.get("og_center_y", 0.5), p)
            rows.append(("og.jpg", OG_SIZE, os.path.getsize(p)))

    print(f"\nNguồn: {src}\nĐích : {out}\n")
    print(f"{'File':34} {'Kích thước':>11} {'KB':>8}")
    print("-" * 56)
    total = 0
    for fn, (w, h), size in rows:
        total += size
        print(f"{fn:34} {w:>5}x{h:<5} {size / 1024:>8.1f}")
    print("-" * 56)
    print(f"{'Tổng (' + str(len(rows)) + ' file)':34} {'':>11} {total / 1024:>8.1f}")
    if missing:
        print("\nKHÔNG TÌM THẤY ảnh gốc cho khoá:", ", ".join(missing))
    print("\nKích thước bản 960 (để đối chiếu với IMAGES trong js/images.js):")
    print("\n".join(js_lines))


if __name__ == "__main__":
    main()
