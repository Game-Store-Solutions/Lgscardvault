# Brand assets

## Logo

Official LGS Card Vault lockups provided by the brand owner:

| File | Use |
|------|-----|
| `logo-dark.png` | Gold mark on black (nav, dark surfaces, favicon source) |
| `logo-light.png` | Navy/gold mark on white (light heroes) |
| `logo-light-alt.png` | Alternate light lockup |
| `mark.png` | Square crop for compact UI / “powered by” |

Favicons in `frontend/public/` (`favicon.ico`, `favicon-16.png`, `favicon-32.png`, `apple-touch-icon.png`) are generated from `logo-dark.png` via `scripts/build_brand_assets.py`.

## Landing hero cards (`brand/cards/`)

Marketing-only floating card art for the empty-marketplace landing page.
Not used as catalog imagery. Game trademarks belong to their respective owners.

| File | Game | Source |
|------|------|--------|
| `mtg-*.jpg` | Magic: The Gathering | [Scryfall](https://scryfall.com/docs/api) image API (`format=image&version=png`, resized) |
| `op-*.jpg` | One Piece Card Game | Official Bandai card list images (`en.onepiece-cardgame.com`) |
| `fab-*.jpg` | Flesh and Blood | TCGplayer product images (resized) |
| `pkm-*.jpg` | Pokémon TCG | [Pokémon TCG API](https://docs.pokemontcg.io/) image CDN (`images.pokemontcg.io`) |

Regenerate with:

```bash
python scripts/build_brand_assets.py
```
