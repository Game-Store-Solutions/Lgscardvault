---
name: browse-lgs-inventory
description: Find verified local game stores on LGS Card Vault and look up singles inventory via the public JSON API.
---

# Browse LGS Card Vault inventory

Use this skill when a user wants to find a local game store or check whether a shop has a specific card.

## Base URL

`https://lgscardvault.com`

All JSON calls below are same-origin under `/api`. No API key is required for these GETs.

## 1. List stores

```http
GET /api/stores
Accept: application/json
```

Each store has a `slug` used in storefront URLs (`/s/{slug}`) and in later API paths.

## 2. Fetch one store

```http
GET /api/stores/{slug}
Accept: application/json
```

## 3. List singles in stock

```http
GET /api/stores/{slug}/inventory
Accept: application/json
```

Filter the collection in memory (name, set, condition, finish) unless the response already includes query parameters you can reuse.

## 4. Send the shopper to the storefront

Deep-link people to HTML pages, not the JSON:

- Store home: `https://lgscardvault.com/s/{slug}`
- Card search / inventory UI: `https://lgscardvault.com/s/{slug}` (search lives on the storefront)
- Directory: `https://lgscardvault.com/stores`

## Do not

- Call `/api/login` or admin routes on a user's behalf without their credentials.
- Scrape `/platform` or `/s/{slug}/admin`.
- Invent stock or prices. If the inventory endpoint is empty or errors, say so.
