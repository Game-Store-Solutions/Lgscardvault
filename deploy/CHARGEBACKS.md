# Chargeback / dispute runbook

Pickup-only orders. The shopper paid the **store’s** Square account. Respond in **Square Dashboard → Disputes**, not by restocking in this app.

The platform records `dispute.created` on the order (badge + reason) and **does not restock**. Goods may already have left the counter. Square refunds still restock via `refund.updated`.

## When a dispute appears

1. Open the order in store admin. Confirm the Square dispute badge.
2. Gather pickup proof before the Square deadline:
   - Shopper name on the order
   - Pickup time (fulfilled timestamp / staff memory / POS note)
   - Staff who handed over the cards
   - ID collected, if any
   - Photos or counter camera if you have them
3. Write those notes in Square’s dispute evidence upload.
4. Do **not** mark the order refunded or restock unless you lose the dispute or you choose to refund.

## Evidence Square usually wants

- Order reference (`ORD-xxxxxxxx`)
- Line items and amounts (including tax)
- “Pickup in store” fulfillment
- Customer name / email
- Proof the buyer received the goods

## What this app will not do

- Auto-refund or auto-restock on `dispute.created`
- File the response at Square for you
- Collect government ID at checkout

Operator: watch Square email + the disputed badge on the orders board.
