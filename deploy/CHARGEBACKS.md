# Chargeback / dispute runbook

Pickup-only orders. The shopper paid the **store’s** Square or PayPal account. Respond in **Square Dashboard → Disputes** or **PayPal Resolution Center**, matching `orders.payment_provider`. Do not restock in this app because of the dispute.

The platform records the dispute webhook on the order (badge + reason) and **does not restock**. Goods may already have left the counter. Processor refunds still restock via the refund webhook.

## When a dispute appears

1. Open the order in store admin. Confirm the Square or PayPal dispute badge.
2. Gather pickup proof before the processor deadline:
   - Shopper name on the order
   - Pickup time (fulfilled timestamp / staff memory / POS note)
   - Staff who handed over the cards
   - ID collected, if any
   - Photos or counter camera if you have them
3. Write those notes in Square’s dispute evidence upload or PayPal Resolution Center.
4. Do **not** mark the order refunded or restock unless you lose the dispute or you choose to refund.

## Evidence processors usually want

- Order reference (`ORD-xxxxxxxx`)
- Line items and amounts (including tax)
- “Pickup in store” fulfillment
- Customer name / email
- Proof the buyer received the goods

## What this app will not do

- Auto-refund or auto-restock on dispute created
- File the response at Square or PayPal for you
- Collect government ID at checkout

Operator: watch Square / PayPal email + the disputed badge on the orders board.

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
