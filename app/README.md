# INTENTLOCK

**The Trust & Authorization Layer for AI Commerce**

Let AI decide what to buy. Let users decide what AI is allowed to spend.

INTENTLOCK is a full-stack starter for an AI purchasing workflow where an agent can interpret a shopping request, find products, and prepare a transaction — but cannot spend money outside the user's explicit mandate.

## What is implemented

- Natural-language purchase intent interpreter (`api/services/intentService.ts`)
- Seeded product catalogue with approved/unapproved merchants (`api/services/catalogService.ts`)
- Spending Constitution policy engine (`api/services/policyEngine.ts`)
- Intent-to-Payment Binding with canonical payloads and HMAC integrity hashes (`api/services/integrity.ts`)
- Purchase mandate creation, expiry, approval, blocking, and audit events (`api/services/mandateService.ts`)
- Safe PayPal sandbox simulation with duplicate-capture protection (`api/services/paymentService.ts`)
- Security Lab scenarios:
  - Budget manipulation
  - Unapproved merchant
  - Product substitution
  - Duplicate payment
  - Expired authorization
  - Webhook forgery
- React dashboard for intent interpretation, product comparison, mandate approval, simulated checkout, transactions, and audit timeline

## Stack

This starter uses the Kimi full-stack runtime:

- React + TypeScript + Vite
- Tailwind CSS + shadcn/ui
- Hono + tRPC
- Drizzle ORM + MySQL
- Simulated PayPal sandbox flow by default

The uploaded strategy document proposed Express + PostgreSQL. This repository keeps the same architecture and security model, adapted to the Kimi runtime so the project can run and persist data here.

## Run locally

```bash
npm install
npm run db:push
npm run dev
```

Open `http://localhost:3000`.

The product catalogue seeds itself on first catalogue/API access. You can also run:

```bash
npx tsx db/seed.ts
```

## Important environment variables

Copy `.env.example` for local development. Do not commit real credentials.

`MANDATE_HASH_SECRET` signs the canonical purchase record. Rotate it before any real deployment.

PayPal credentials are optional in this starter. Without them, the app runs in `simulated-sandbox` mode so the authorization flow can be demonstrated safely.

## Enabling real PayPal Orders API

`api/services/paymentService.ts` currently isolates payment execution behind `createOrderForMandate` and `captureOrderForMandate`. Replace the simulated order/capture section with PayPal Orders API v2 calls after adding sandbox credentials.

Keep these rules:

1. Create orders only for `APPROVED` mandates.
2. Revalidate mandate expiry, amount, currency, merchant, product, and integrity hash immediately before capture.
3. Store `PayPal-Request-Id` or equivalent idempotency keys for payment calls.
4. Verify webhook signatures before updating transaction state.
5. Never expose PayPal secrets to the browser.

## API surface

All application APIs are exposed through tRPC under `trpc.intentlock.*`:

- `dashboard`
- `catalog`
- `interpret`
- `createMandate`
- `approveMandate`
- `createOrder`
- `captureOrder`
- `mandates`
- `runSecurityScenario`

## Demo flow

1. Enter: `Find a wireless keyboard under $40, new only, from approved merchants.`
2. Interpret the request.
3. Create a mandate for an allowed product.
4. Approve the exact purchase.
5. Create the simulated PayPal sandbox order.
6. Capture the payment.
7. Run Security Lab scenarios and inspect the audit timeline.

## Security note

This is a hackathon starter, not production payment infrastructure. It demonstrates controlled authorization and auditable payment execution, but it does not implement official AP2, production merchant onboarding, real fraud detection, or live money movement.
