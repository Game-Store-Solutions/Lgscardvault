# Stores & branding

Covers the public store directory, storefront-by-slug page, branding/theme editor, store payment connections, and platform-admin management of stores and users.

`Store` is an API Platform resource. Public GET operations use state providers, admin writes use `StoreAdminProcessor`, and owner-managed branding/settings writes go through `StoreSettingsController`.

| Operation | Route | Backend |
|-----------|-------|---------|
| List active stores | `GET /api/stores` | `ActiveStoreCollectionProvider` |
| Store by slug | `GET /api/stores/{slug}` | `StoreBySlugProvider` |
| Admin list stores | `GET /api/admin/stores` | API Platform default, super-admin only |
| Admin create store | `POST /api/admin/stores` | `StoreAdminProcessor` |
| Admin update store | `PATCH /api/admin/stores/{id}` | `StoreAdminProcessor` |
| Update branding/settings | `PATCH /api/stores/{slug}/settings` | `StoreSettingsController` |
| Payment status | `GET /api/stores/{slug}/payments` | `StorePaymentController` |
| Square connect/disconnect | `POST /api/stores/{slug}/payments/square/connect`, `POST /api/stores/{slug}/payments/square/disconnect` | `StorePaymentController` |
| Square OAuth callback | `GET /api/integrations/square/callback` | `StorePaymentController` |

---

## Browse store directory

```mermaid
flowchart LR
    hp["HomePage.tsx<br/>useQuery(['stores'])"] --> rt["GET /api/stores"]
    rt --> p["ActiveStoreCollectionProvider::provide()"]
    p --> repo["StoreRepository::findActiveStores()"]
    repo --> db["stores SELECT active ORDER BY name"]
    p --> hp
```

Public, no auth. Returns active stores serialized with the `store:read` group, including public branding fields.

---

## View a storefront by slug

```mermaid
flowchart LR
    subgraph FE["StorePage.tsx"]
        us["useStore(slug)"]
        theme["useStoreTheme(store)<br/>storeThemeVars()"]
        inv["useInventory(slug)"]
        hero["StoreHero"]
        cards["Card grid/list"]
    end
    us --> rt["GET /api/stores/{slug}"]
    rt --> prov["StoreBySlugProvider::provide()"]
    prov --> repo["StoreRepository::findOneBySlug()"]
    repo --> db["stores SELECT slug"]
    us --> theme --> hero
    us --> cards
    inv --> cards
```

The store's branding columns become CSS custom properties and rendering options. `cardDisplayStyle` controls how inventory cards render on the storefront:

- `gallery` - compact image-first grid.
- `marketplace` - card-detail layout with add-to-cart action.

Inventory is fetched separately; see [catalog-and-inventory.md](catalog-and-inventory.md#browse-store-inventory).

| Layer | Where |
|-------|-------|
| Frontend | `pages/StorePage.tsx`, `hooks/useStore.ts`, `hooks/useStoreTheme.ts`, `lib/storeTheme.ts`, `components/store/StoreHero.tsx`, `components/cards/*` |
| Route | `GET /api/stores/{slug}` |
| Entry | `State/StoreBySlugProvider.php` |
| Repo/DB | `StoreRepository::findOneBySlug` -> `stores` |

---

## Update branding & settings

```mermaid
flowchart LR
    subgraph FE["BrandingTab.tsx"]
        form["Branding form<br/>colors, urls, hero text,<br/>spotlightMinPriceCents, cardDisplayStyle"]
        preview["Live preview"]
        mut["api.patch('/stores/{slug}/settings')"]
    end
    form --> mut
    mut --> rt["PATCH /api/stores/{slug}/settings"]
    rt --> ctl["StoreSettingsController::update()"]
    ctl --> voter["STORE_MANAGE voter"]
    voter --> updater["StoreSettingsUpdater::update()"]
    updater --> db["stores UPDATE branding/settings"]
    updater --> mut
    form --> preview
```

- Validation lives in `StoreSettingsUpdater`: colors must match `#RRGGBB`, URLs must start with `http(s):` or `/`, text fields have max lengths, and `cardDisplayStyle` must be `gallery` or `marketplace`.
- `StoreVoter` gates the write: store owner or super-admin only.
- The branding tab saves `cardDisplayStyle` immediately when the owner changes the display option, then keeps the local store query cache in sync with the returned store payload.

| Layer | Where |
|-------|-------|
| Frontend | `pages/store-admin/BrandingTab.tsx`, `hooks/useStore.ts` |
| Route | `PATCH /api/stores/{slug}/settings` |
| Entry | `Controller/StoreSettingsController::update()` |
| Service | `Service/Store/StoreSettingsUpdater` |
| DB | `stores` |

---

## Store payment connections

Payment provider connections belong to the store owner. Provider tokens are stored on `store_payment_accounts`, encrypted before persistence, and are never returned by the API. Platform administrators should not receive provider credentials.

```mermaid
sequenceDiagram
    autonumber
    actor Owner
    participant FE as PaymentsTab.tsx
    participant API as StorePaymentController
    participant State as SignedOAuthState
    participant Square as Square OAuth
    participant DB as PostgreSQL

    Owner->>FE: Connect Square
    FE->>API: POST /stores/{slug}/payments/square/connect
    API->>State: create signed state
    API-->>FE: authorizationUrl
    FE->>Square: redirect owner
    Square->>API: GET /api/integrations/square/callback
    API->>State: verify state
    API->>Square: exchange code for token
    API->>DB: upsert store_payment_accounts
    API-->>FE: redirect /s/{slug}/admin/payments?square=connected
```

- `GET /api/stores/{slug}/payments` returns sanitized provider status only.
- `POST /payments/square/connect` requires `STORE_MANAGE` and returns an authorization URL when sandbox/production application id + secret are configured (`SQUARE_SANDBOX_*` / `SQUARE_PRODUCTION_*`).
- `POST /payments/square/disconnect` revokes the Square token when possible, then clears encrypted tokens and marks the account disconnected.
- The callback verifies signed OAuth state before writing the connection, so a Square response can only attach to the store/user that initiated it.
- Once connected, shopper checkout charges through that account — see [payments-and-billing.md](payments-and-billing.md#store-checkout-shopper--store).
- The same Payments tab also shows the store's **platform subscription** status (up to date / past due / suspended) via `GET /api/stores/{slug}/subscription`.

| Layer | Where |
|-------|-------|
| Frontend | `pages/store-admin/PaymentsTab.tsx` |
| Routes | `Controller/StorePaymentController.php`, `Controller/StoreSubscriptionController.php` |
| Provider client | `Service/Payments/SquareOAuthClient.php`, `StoreCheckoutGateway.php` |
| OAuth state | `Service/Payments/SignedOAuthState.php` |
| Secret handling | `Service/Security/SecretCipher.php` |
| Repo/DB | `StorePaymentAccountRepository` -> `store_payment_accounts` |

---

## Platform admin - stores & users

```mermaid
flowchart LR
    subgraph FE["PlatformAdminPage.tsx"]
        stores["GET /admin/stores"]
        users["GET /admin/users"]
        billing["GET /admin/billing"]
        create["POST /admin/stores"]
        editUser["POST/PATCH /admin/users"]
    end
    stores --> dstore["stores SELECT all"]
    users --> duser["users SELECT all"]
    billing --> bill["AdminBillingController<br/>stores + subscription_charges"]
    create --> sap["StoreAdminProcessor::process()"]
    sap --> promote["promote owner to ROLE_STORE_OWNER"]
    sap --> wstore["stores INSERT/UPDATE + users UPDATE roles"]
    editUser --> uap["UserAdminProcessor::process()"]
    uap --> wuser["users INSERT/UPDATE"]
```

- All `/api/admin/*` operations require `ROLE_SUPER_ADMIN`.
- The tenant filter is disabled for admin routes so platform administrators can manage all stores.
- Creating a store through `StoreAdminProcessor` promotes the chosen owner to `ROLE_STORE_OWNER`.
- `UserAdminProcessor` hashes `plainPassword` before persisting.
- Subscription billing (MRR, overdue, monthly history, charge-now) lives in `BillingPanel` — see [payments-and-billing.md](payments-and-billing.md#platform-admin-billing-dashboard).

| Layer | Where |
|-------|-------|
| Frontend | `pages/PlatformAdminPage.tsx`, `pages/platform-admin/BillingPanel.tsx` |
| Routes | `GET/POST /api/admin/stores`, `PATCH /api/admin/stores/{id}`, `GET/POST/PATCH /api/admin/users[/{id}]`, `GET /api/admin/billing` |
| Entry | `State/StoreAdminProcessor.php`, `State/UserAdminProcessor.php`, `Controller/AdminBillingController.php` |
| DB | `stores`, `users`, `subscription_charges` |
