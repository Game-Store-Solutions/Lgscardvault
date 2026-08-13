"""Generate favicons from logo + download landing hero card art."""

from __future__ import annotations

import ssl
import time
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "frontend" / "public"
BRAND = ROOT / "brand"
CARDS = BRAND / "cards"
UA = "LgscardvaultLanding/1.0 (brand assets; https://lgscardvault.com)"


def write_favicons(logo_path: Path) -> None:
    logo = Image.open(logo_path).convert("RGBA")
    w, h = logo.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    sq = logo.crop((left, top, left + side, top + side))
    inset = max(1, int(side * 0.02))
    sq = sq.crop((inset, inset, side - inset, side - inset))

    outputs = {
        ROOT / "favicon-16.png": 16,
        ROOT / "favicon-32.png": 32,
        ROOT / "apple-touch-icon.png": 180,
        BRAND / "mark.png": 256,
        BRAND / "android-chrome-192.png": 192,
        BRAND / "android-chrome-512.png": 512,
    }
    for path, size in outputs.items():
        sq.resize((size, size), Image.Resampling.LANCZOS).save(path, optimize=True)

    ico = [sq.resize((s, s), Image.Resampling.LANCZOS) for s in (16, 32, 48)]
    ico[0].save(ROOT / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    print("favicons ok")


def fetch(url: str, dest: Path, *, insecure: bool = False, delay: float = 0.2) -> bool:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; Lgscardvault/1.0)",
            "Accept": "*/*",
        },
    )
    context = ssl._create_unverified_context() if insecure else ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, timeout=45, context=context) as response:
            dest.write_bytes(response.read())
        print(f"saved {dest.name} ({dest.stat().st_size} bytes)")
        time.sleep(delay)
        return True
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        print(f"FAIL {dest.name}: {exc}")
        return False


def download_cards() -> None:
    CARDS.mkdir(parents=True, exist_ok=True)

    mtg = [
        (
            "mtg-teferi.png",
            "https://api.scryfall.com/cards/named?exact=Teferi%2C+Hero+of+Dominaria&format=image&version=png",
        ),
        (
            "mtg-ragavan.png",
            "https://api.scryfall.com/cards/named?exact=Ragavan%2C+Nimble+Pilferer&format=image&version=png",
        ),
        (
            "mtg-sheoldred.png",
            "https://api.scryfall.com/cards/named?exact=Sheoldred%2C+the+Apocalypse&format=image&version=png",
        ),
        (
            "mtg-lotus.png",
            "https://api.scryfall.com/cards/named?exact=Black+Lotus&set=vma&format=image&version=png",
        ),
    ]
    for name, url in mtg:
        fetch(url, CARDS / name)

    one_piece = [
        ("op-luffy.png", "https://en.onepiece-cardgame.com/images/cardlist/card/OP01-001.png"),
        ("op-zoro.png", "https://en.onepiece-cardgame.com/images/cardlist/card/OP01-025.png"),
        ("op-nami.png", "https://en.onepiece-cardgame.com/images/cardlist/card/OP01-016.png"),
    ]
    for name, url in one_piece:
        fetch(url, CARDS / name)

    fab = [
        ("fab-bravo.jpg", "https://tcgplayer-cdn.tcgplayer.com/product/222119_in_1000x1000.jpg"),
        ("fab-dorinthea.jpg", "https://tcgplayer-cdn.tcgplayer.com/product/222120_in_1000x1000.jpg"),
        ("fab-prism.jpg", "https://tcgplayer-cdn.tcgplayer.com/product/233198_in_1000x1000.jpg"),
    ]
    for name, url in fab:
        fetch(url, CARDS / name, insecure=True)


def compress_to_jpg(max_width: int = 420) -> None:
    keep_stems = {
        "mtg-teferi",
        "mtg-ragavan",
        "mtg-sheoldred",
        "mtg-lotus",
        "op-luffy",
        "op-zoro",
        "op-nami",
        "fab-bravo",
        "fab-dorinthea",
        "fab-prism",
    }
    for path in list(CARDS.iterdir()):
        if path.stem not in keep_stems:
            path.unlink(missing_ok=True)
            continue
        img = Image.open(path).convert("RGB")
        if img.width > max_width:
            h = int(img.height * (max_width / img.width))
            img = img.resize((max_width, h), Image.Resampling.LANCZOS)
        out = CARDS / f"{path.stem}.jpg"
        img.save(out, quality=86, optimize=True, progressive=True)
        if path != out:
            path.unlink(missing_ok=True)
        print(f"jpg {out.name} ({out.stat().st_size} bytes)")


if __name__ == "__main__":
    write_favicons(BRAND / "logo-dark.png")
    download_cards()
    compress_to_jpg()
    print("files:", sorted(p.name for p in CARDS.iterdir()))
