# Planned payments

## Status

Planned; not implemented.

## Decision

If MovaYakVDoma introduces paid digital access inside Telegram, use Telegram
Stars (`XTR`) for the in-bot checkout. Telegram requires Stars for digital
goods and services sold through bots and Mini Apps.

Stripe remains an option only for a separate web checkout when the business is
registered in a Stripe-supported country. It is not the in-Telegram payment
path for premium bot access.

## Scope of a future Stars slice

- a product and price in Stars;
- invoice, pre-checkout, successful-payment, idempotent fulfilment, and refund
  handling;
- persistent payment records and support/refund flow;
- tests for duplicate updates and failed fulfilment.

The existing Monobank flow stays a voluntary support flow. It must not be
presented as a sale of premium digital access.
