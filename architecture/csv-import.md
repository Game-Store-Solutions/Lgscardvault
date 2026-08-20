# CSV import

Bulk inventory import via CSV. Uploads are parsed, persisted as a job plus rows, then processed in the background by a Symfony Messenger worker that resolves each card and writes inventory. The frontend polls for progress.

> Requires a running CSV worker. Rows stay `queued` until `php bin/console messenger:consume csv` is running. Transport: `doctrine://default?queue_name=store_import` (see [messenger.yaml](../backend/config/packages/messenger.yaml)). Archidekt / catalog work uses the separate `async` transport so harvest cannot starve imports.

All routes are under `StoreCsvImportController` at `/api/stores/{slug}/csv-imports`, gated by `ROLE_USER` and `STORE_MANAGE`.

| Action | Route |
|--------|-------|
| Upload | `POST /api/stores/{slug}/csv-imports` |
| List runs | `GET /api/stores/{slug}/csv-imports` |
| Current run | `GET /api/stores/{slug}/csv-imports/current` |
| Run detail (+ row window) | `GET /api/stores/{slug}/csv-imports/{id}` |
| Pause / Resume / Retry / Retry-failed / Cancel | `POST /api/stores/{slug}/csv-imports/{id}/{action}` |
| Preview failed row matches | `POST /api/stores/{slug}/csv-imports/{id}/failed/preview` |
| Finalize matched failed rows | `POST /api/stores/{slug}/csv-imports/{id}/failed/manual-import` |
| Manually resolve one failed row | `POST /api/stores/{slug}/csv-imports/{id}/rows/{rowIndex}/manual-import` |

---

## Full lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor Owner
    participant FE as CsvTab.tsx
    participant Ctl as StoreCsvImportController
    participant P as CsvImportParser
    participant DB as PostgreSQL
    participant Bus as MessageBus
    participant W as ProcessCsvImportMessageHandler (worker)
    participant R as CatalogCardResolver
    participant SC as ScryfallClient
    participant IW as StoreInventoryWriter

    Owner->>FE: choose CSV file
    FE->>Ctl: POST /csv-imports (multipart file)
    Ctl->>P: parse(content)
    P-->>Ctl: rows[] + warnings (validate headers, <=50k rows)
    Ctl->>DB: INSERT csv_import_jobs (status=queued)
    Ctl->>DB: INSERT csv_import_rows[] (status=queued)
    Ctl->>Bus: dispatch ProcessCsvImportMessage(jobId)
    Ctl-->>FE: 201 CsvImportJob

    Note over FE: poll every 3s while status active
    FE->>Ctl: GET /csv-imports/current (rowLimit=75)

    loop until no queued rows
        Bus->>W: ProcessCsvImportMessage(jobId)
        W->>DB: job.status = processing, startedAt
        W->>DB: claimNextQueued(job, 25): SELECT FOR UPDATE SKIP LOCKED, mark 25 processing
        Note over W,SC: batch pre-resolution (preResolveRows)
        W->>R: matchLocal() per row — indexed natural-key lookup
        W->>SC: ONE fetchCollectionBySetCollectors() for local misses<br/>(75 identifiers per request)
        loop each of the 25 rows
            alt pre-resolved (local or collection batch)
                W->>IW: write(store, card, qty, cond, foil) [flush=false]
                W->>DB: row.status = imported, importedItemId
            else fallback: R.resolve() (search → MTGJSON)
                alt card resolved
                    W->>IW: write(store, card, qty, cond, foil) [flush=false]
                    W->>DB: row.status = imported, importedItemId
                else not found
                    W->>DB: row.status = error, error msg
                end
            end
        end
        W->>DB: flush batch (inventory_items + rows + job counters)
        W->>DB: backfill importedItemId for newly created items
        alt more queued rows
            W->>Bus: dispatch next ProcessCsvImportMessage
        else
            W->>DB: job.status = completed, finishedAt
        end
    end
```

**Batch resolution economics**: once the catalog holds every printing (`default_cards` sync), a batch resolves entirely from the indexed local natural-key lookups — zero API calls. Cold-catalog imports cost at most `ceil(misses / 75)` collection requests per batch instead of one rate-limited search per row (a ~75× reduction). Rows the collection endpoint can't place fall back to the full per-row cascade so error messages stay specific.

---

## Why batched + self-dispatching?

Rather than one long-running handler, each message processes **25 rows** then enqueues the next batch. This gives:

- **Exactly-once rows** - `CsvImportRowRepository::claimNextQueued()` wraps a `SELECT ... FOR UPDATE SKIP LOCKED` plus `UPDATE ... status='processing', claimed_at=NOW()` in a transaction, so concurrent workers never grab the same rows and a crash mid-batch does not double-import.
- **Bounded memory / flushes** - inventory writes use `flush=false` and are flushed once per batch, not per row.
- **Progress visibility** - job counters (`processed/imported/failed_rows`) are recomputed and flushed each batch, so polling shows steady movement.

### Concurrency hardening

Multiple workers can process one job in parallel (the SKIP-LOCKED claim is built for it), and users can pause/resume/retry mid-run. Several races are closed explicitly:

- **Live vs. abandoned rows.** `claimNextQueued` stamps `claimed_at`. When a worker finds zero queued rows but some still `processing`, `completeJob` only requeues rows whose claim is older than `STALE_CLAIM_SECONDS` (crashed handler) — a live handler's freshly claimed rows are left alone, and a delayed re-check message keeps the job alive in case that handler dies. Requeueing live rows was a double-import: a second worker would re-import them while the first was still writing.
- **Guarded state transitions.** `queued/processing → processing` (batch start) and `processing → completed` are conditional `UPDATE ... WHERE status IN (...)` statements, so a pause/cancel committed by the controller in the same window is never silently overwritten by a blind `setStatus()+flush()`.
- **Contended inventory lines.** If two batches touch the same `(store, card, condition, is_foil)` tuple, the losing batch flush throws a unique-violation / optimistic-lock error; the handler catches it, requeues *its* claimed rows, and re-dispatches — the re-run finds the winner's row and merges instead of failing the whole job.

```mermaid
stateDiagram-v2
    [*] --> queued: upload
    queued --> processing: worker claims rows
    processing --> completed: no rows left (guarded transition)
    processing --> failed: unhandled exception (never over completed/cancelled)
    processing --> processing: contended batch requeued + retried
    processing --> paused: POST /pause
    paused --> queued: POST /resume (requeue)
    failed --> queued: POST /retry
    completed --> queued: POST /retry-failed (legacy requeue)
    completed --> completed: manual failed-row recovery
    queued --> cancelled: POST /cancel
    processing --> cancelled: POST /cancel
```

Row states: `queued -> processing -> imported | error`. The legacy `retry-failed` endpoint flips `error` rows back to `queued` and re-dispatches. The owner-facing failed-card flow now previews matches and moves confirmed rows directly from `error` to `imported`.

---

## Failed row recovery

Failed rows can be recovered without re-running the worker:

```mermaid
sequenceDiagram
    autonumber
    actor Owner
    participant FE as ImportRunDetailsPage
    participant Ctl as StoreCsvImportController
    participant R as CatalogCardResolver
    participant IW as StoreInventoryWriter
    participant DB as PostgreSQL

    Owner->>FE: click Retry failed cards
    FE->>Ctl: POST /csv-imports/{id}/failed/preview
    Ctl->>R: local match by name/set/collector/rarity/finish
    Ctl->>SC: batch collection lookup by set + collector
    SC-->>Ctl: matched cards, upserted locally
    Ctl-->>FE: matched/unmatched rows
    FE->>Owner: confirmation modal
    Owner->>FE: finalize matched cards
    FE->>Ctl: POST /csv-imports/{id}/failed/manual-import
    loop each selected match
        Ctl->>IW: write(store, card, qty, condition, foil)
        Ctl->>DB: row.status = imported, error = null
    end
    Ctl->>DB: recompute job counters
    Ctl-->>FE: updated CsvImportJob
```

- `failed/preview` checks local cards first, then uses Scryfall's collection endpoint in 75-card batches by set + collector number. This avoids one HTTP search per failed row.
- The confirmation modal shows matched cards and rows that still need review. Finalize imports only the matched rows.
- `rows/{rowIndex}/manual-import` powers the one-row Resolve button from the failed table.
- Both manual import paths use the same `StoreInventoryWriter`, so recovered rows merge into existing inventory lines by `(store, card, condition, is_foil)`.

---

## Status polling & run details

```mermaid
flowchart LR
    subgraph FE["Frontend (TanStack Query polling)"]
        cur["CsvTab: GET /csv-imports/current<br/>refetch 3s while active"]
        det["ImportRunDetailsPage:<br/>GET /csv-imports/{id}?rowStatus=imported|error<br/>refetch 3s while active"]
        plat["PlatformStoreImportsPage:<br/>GET /csv-imports (refetch 5s)"]
    end
    cur & det & plat --> ctl["StoreCsvImportController<br/>show() / list() / current()"]
    ctl --> win["CsvImportRowRepository::findWindow()<br/>(offset/limit/status)"]
    ctl --> recent["CsvImportJobRepository::findRecentByStore(50)"]
    win --> db[("csv_import_rows SELECT window")]
    recent --> db2[("csv_import_jobs SELECT DESC 50")]
```

The detail page renders two windows: imported rows (paginated) and failed rows. It also exposes pause/resume/retry/cancel controls, per-row Resolve actions, and the batch Retry failed cards review modal. Polling switches off automatically once the job reaches a terminal state (`completed/failed/cancelled/paused`).

### Manual resolve search

The per-row **Resolve** action searches the catalog (`GET /api/catalog/search`) with the row's name **and** its set + collector number. The search resolves by the **natural key (set + collector)** as well as by name, so a printing is found even when the CSV name is decorated or misspelled (`"Sol Ring (Retro Frame)"`). This mirrors what the batch *Retry failed cards* flow does — previously the per-row search matched by name only and could return an empty result for a card the batch retry would find.

### Per-import logging

Each import run writes a dedicated JSONL log at `var/log/imports/import-<jobId>.log` (`Service/Import/ImportLogger`), capturing its full timeline — `batch_claimed`, `batch_processed`, `row_failed`, `completed`/`failed`, and the recovery actions (`retry_failed_requested`, `row_manually_resolved`, `batch_manually_resolved`). Events are also mirrored to the main application log tagged with the job id, so a single run can be traced either in its own file or in centralized logging. Writes are best-effort and never fail an import.

---

## Where to go

| Concern | File |
|---------|------|
| HTTP endpoints | `Controller/StoreCsvImportController.php` |
| CSV parsing & header aliases | `Service/CsvImport/CsvImportParser.php` |
| Async message + handler | `Message/ProcessCsvImportMessage.php`, `MessageHandler/ProcessCsvImportMessageHandler.php` |
| Row claiming / counters | `Repository/CsvImportRowRepository.php` (`claimNextQueued`, `countByStatus`, `findWindow`, `retryFailedRows`) |
| Job persistence | `Repository/CsvImportJobRepository.php`, `Entity/CsvImportJob.php`, `Entity/CsvImportRow.php` |
| Card resolution | `Service/Catalog/CatalogCardResolver.php` (see [catalog-and-inventory.md](catalog-and-inventory.md#card-resolution-cascade)) |
| Inventory write | `Service/Inventory/StoreInventoryWriter.php` |
| Transport config | `config/packages/messenger.yaml` |
| Frontend | `pages/store-admin/CsvTab.tsx`, `ImportRunDetailsPage.tsx`, `csv-shared.tsx`, `pages/PlatformStoreImportsPage.tsx` |
| DB tables | `csv_import_jobs`, `csv_import_rows`, `messenger_messages`, `inventory_items`, `cards` |
