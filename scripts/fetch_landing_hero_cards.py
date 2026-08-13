"""Download high-quality landing hero cards (incl. Riftbound).

Marketing-only art for FloatingCardsBackdrop. Trademarks belong to owners.
"""

from __future__ import annotations

import ssl
import time
import urllib.request
from pathlib import Path

from PIL import Image

CARDS = Path(__file__).resolve().parents[1] / "frontend" / "public" / "brand" / "cards"
UA = {"User-Agent": "Mozilla/5.0 (compatible; Lgscardvault/1.0)", "Accept": "*/*"}
CTX = ssl._create_unverified_context()
# Keep art sharp on large landing screens (Riot CDN is already 744px wide).
MAX_WIDTH = 520


DOWNLOADS: list[tuple[str, str]] = [
    # —— Riftbound (Riot CMS CDN, 744×1039) ——
    (
        "rb-annie.png",
        "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/532d75dc36a16eb5954253a77366fcceac7aec62-744x1039.png",
    ),
    (
        "rb-jinx.png",
        "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/a7fe105f40df66525be51bd18e25506945a7b027-744x1039.png",
    ),
    (
        "rb-ahri.png",
        "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/fabbcc2f83f397cf07299236a702db05a151053b-744x1039.png",
    ),
    (
        "rb-yasuo.png",
        "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/1643a6c93626884c93363557e1a483642bda6c45-744x1039.png",
    ),
    (
        "rb-lux.png",
        "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/a0d10edf30abb6fde21f5d386e9a7db3c1b0a098-744x1039.png",
    ),
    (
        "rb-darius.png",
        "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/bf7a4900fd2296972c1305a4707c23860bb0522e-744x1039.png",
    ),
    (
        "rb-leesin.png",
        "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/c6cc55639ad87cf9c8a74d6b3e5292d0b192c9b8-744x1039.png",
    ),
    (
        "rb-vi.png",
        "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/7ab52254ac49b8853fc7ae65b03aaee3f8c5994a-744x1039.png",
    ),
    (
        "rb-kaisa.png",
        "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/ad69bde670ce218adee1d2a618a7295d2fb7bd4c-744x1039.png",
    ),
    (
        "rb-jinx-demo.png",
        "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/d6cac988aa7798945e550eba6841d3993868c4a4-744x1039.png",
    ),
    # —— Extra MTG (Scryfall PNG) ——
    (
        "mtg-atraxa.png",
        "https://api.scryfall.com/cards/named?exact=Atraxa%2C+Praetors%27+Voice&format=image&version=png",
    ),
    (
        "mtg-oko.png",
        "https://api.scryfall.com/cards/named?exact=Oko%2C+Thief+of+Crowns&format=image&version=png",
    ),
    (
        "mtg-force.png",
        "https://api.scryfall.com/cards/named?exact=Force+of+Will&format=image&version=png",
    ),
    (
        "mtg-bowmasters.png",
        "https://api.scryfall.com/cards/named?exact=Orcish+Bowmasters&format=image&version=png",
    ),
    # —— Extra Pokémon (hires CDN) ——
    ("pkm-gengar.png", "https://images.pokemontcg.io/base2/5_hires.png"),
    ("pkm-mew.png", "https://images.pokemontcg.io/basep/8_hires.png"),
    ("pkm-lugia.png", "https://images.pokemontcg.io/neo2/9_hires.png"),
    ("pkm-rayquaza.png", "https://images.pokemontcg.io/ex6/22_hires.png"),
    # —— Extra One Piece (Bandai) ——
    (
        "op-shanks.png",
        "https://en.onepiece-cardgame.com/images/cardlist/card/OP09-118.png?250807",
    ),
    (
        "op-law.png",
        "https://en.onepiece-cardgame.com/images/cardlist/card/OP01-047.png?250807",
    ),
    # —— Extra Flesh and Blood (TCGplayer 1000px) ——
    ("fab-prism-hq.jpg", "https://tcgplayer-cdn.tcgplayer.com/product/233220_in_1000x1000.jpg"),
    ("fab-ira.jpg", "https://tcgplayer-cdn.tcgplayer.com/product/233188_in_1000x1000.jpg"),
]


def fetch(url: str, dest: Path) -> bool:
    req = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=60, context=CTX) as response:
            dest.write_bytes(response.read())
        print(f"OK  {dest.name} ({dest.stat().st_size})")
        time.sleep(0.25)
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"FAIL {dest.name}: {exc}")
        return False


def to_jpg(src: Path, stem: str, max_width: int = MAX_WIDTH) -> Path | None:
    try:
        img = Image.open(src).convert("RGB")
    except Exception as exc:  # noqa: BLE001
        print(f"BAD  {src.name}: {exc}")
        return None
    if img.width > max_width:
        h = int(img.height * (max_width / img.width))
        img = img.resize((max_width, h), Image.Resampling.LANCZOS)
    out = CARDS / f"{stem}.jpg"
    img.save(out, quality=90, optimize=True, progressive=True)
    if src != out:
        src.unlink(missing_ok=True)
    print(f"jpg {out.name} ({out.stat().st_size})")
    return out


def main() -> None:
    CARDS.mkdir(parents=True, exist_ok=True)
    for name, url in DOWNLOADS:
        dest = CARDS / name
        if not fetch(url, dest):
            continue
        stem = Path(name).stem
        # Prefer rb-jinx over rb-jinx-demo naming; keep stem as-is.
        to_jpg(dest, stem)

    print("cards:", len(list(CARDS.glob("*.jpg"))), "jpgs")


if __name__ == "__main__":
    main()
