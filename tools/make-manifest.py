"""Rebuild js/manifest.js (path, width, height) from a local clone of the papes repo.
Usage: python tools/make-manifest.py /path/to/papes      (needs: pip install pillow)
"""
import json, os, re, sys
from PIL import Image
repo = sys.argv[1]
rows = []
for folder, _, files in os.walk(os.path.join(repo, "assets")):
    for name in files:
        if not re.search(r"\.(jpe?g|png|webp|gif)$", name, re.I):
            continue
        path = os.path.join(folder, name)
        with Image.open(path) as image:
            width, height = image.size
            if image.getexif().get(274, 1) in (5, 6, 7, 8):  # EXIF rotated
                width, height = height, width
        rows.append([os.path.relpath(path, repo).replace(os.sep, "/"), width, height])
rows.sort(key=lambda row: row[0].lower())
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "js", "manifest.js")
with open(out, "w", encoding="utf-8") as handle:
    handle.write("window.PAPES_MANIFEST = " + json.dumps(rows, ensure_ascii=False) + ";\n")
print(len(rows), "wallpapers")
