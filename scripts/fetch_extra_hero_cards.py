"""Download extra landing hero cards (Pokémon + Flesh and Blood)."""

from __future__ import annotations

import ssl
import time
import urllib.request
from pathlib import Path

from PIL import Image

CARDS = Path(__file__).resolve().parents[1] / "frontend" / "public" / "brand" / "cards"
UA = {"User-Agent": "Mozilla/5.0 (compatible; Lgscardvault/1.0)", "Accept": "*/*"}
CTX = ssl._create_unverified_context()


def fetch(url: str, dest: Path) -> bool:
    req = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=45, context=CTX) as response:
            dest.write_bytes(response.read())
        print(f"OK {dest.name} ({dest.stat().st_size})")
        time.sleep(0.2)
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"FAIL {dest.name}: {exc}")
        return False


def to_jpg(src: Path, stem: str, max_width: int = 420) -> None:
    img = Image.open(src).convert("RGB")
    if img.width > max_width:
        h = int(img.height * (max_width / img.width))
        img = img.resize((max_width, h), Image.Resampling.LANCZOS)
    out = CARDS / f"{stem}.jpg"
    img.save(out, quality=86, optimize=True, progressive=True)
    if src != out:
        src.unlink(missing_ok=True)
    print(f"jpg {out.name} ({out.stat().st_size})")


def main() -> None:
    CARDS.mkdir(parents=True, exist_ok=True)
    downloads = [
        ("pkm-charizard.png", "https://images.pokemontcg.io/base1/4_hires.png"),
        ("pkm-pikachu.png", "https://images.pokemontcg.io/base1/58_hires.png"),
        ("pkm-mewtwo.png", "https://images.pokemontcg.io/base1/10_hires.png"),
        ("pkm-blastoise.png", "https://images.pokemontcg.io/base1/2_hires.png"),
        ("fab-lexi.jpg", "https://tcgplayer-cdn.tcgplayer.com/product/233197_in_1000x1000.jpg"),
        ("fab-chane.jpg", "https://tcgplayer-cdn.tcgplayer.com/product/233162_in_1000x1000.jpg"),
    ]
    for name, url in downloads:
        dest = CARDS / name
        if fetch(url, dest):
            to_jpg(dest, Path(name).stem)

    print("files:", sorted(p.name for p in CARDS.iterdir()))


if __name__ == "__main__":
    main()
