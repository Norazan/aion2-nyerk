"""Shrink the map images fetch-spawns.mjs downloaded, so the app can draw them.

    ..\\.venv\\Scripts\\python -I scripts\\shrink-maps.py

questlog.gg's zone maps are 8192x8192: about 270 MB of memory each once decoded, for a map shown
in a small panel. This rewrites every maps/*.webp (and each zone's tiles, stitched into one image)
as one image of at most MAX_SIDE pixels, which still stays sharp zoomed in. The sectors in
spawns.json describe the whole image whatever its size, so nothing else changes. Needs Pillow
(dev only: `pip install pillow` in the repo's .venv).
"""

import json
import sys
from pathlib import Path

from PIL import Image

MAX_SIDE = 3072
QUALITY = 82
MAPS = Path(__file__).resolve().parents[1] / "src" / "renderer" / "public" / "maps"


def main() -> None:
    spawns = json.loads((MAPS / "spawns.json").read_text(encoding="utf-8"))
    for wid, w in spawns["worlds"].items():
        key = w["key"]
        out = MAPS / f"{key}.webp"
        if w["image"]:
            img = Image.open(out)
        else:
            # Tiles: <key>/<x>_<y>.webp, 1024 px each, x across and y down.
            _, _, nx, ny, _ = w["sectors"]
            img = Image.new("RGBA", (nx * 1024, ny * 1024))
            for x in range(nx):
                for y in range(ny):
                    tile = MAPS / key / f"{x:02d}_{y:02d}.webp"
                    if tile.exists():
                        img.paste(Image.open(tile), (x * 1024, y * 1024))
            w["image"] = True
        before = img.size
        if max(img.size) > MAX_SIDE:
            scale = MAX_SIDE / max(img.size)
            img = img.resize((round(img.size[0] * scale), round(img.size[1] * scale)), Image.LANCZOS)
        img.save(out, "WEBP", quality=QUALITY, method=6)
        if (MAPS / key).is_dir():
            for tile in (MAPS / key).iterdir():
                tile.unlink()
            (MAPS / key).rmdir()
        print(f"{w['name']:28} {before[0]}x{before[1]} -> {img.size[0]}x{img.size[1]}  {out.stat().st_size // 1024} KB")
    # Every world is one image now.
    (MAPS / "spawns.json").write_text(json.dumps(spawns, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    sys.exit(main())
