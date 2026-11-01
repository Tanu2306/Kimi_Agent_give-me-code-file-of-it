import { randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { mandates, products, transactions } from "@db/schema";
import { getMandate } from "./mandateService";
import { validateMandateForCapture } from "./policyEngine";
import { recordAudit } from "./auditService";

function paymentId(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export function payPalMode() {
  const configured = Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
  return {
    configured,
    mode: configured ? "sandbox-api-ready" : "simulated-sandbox",
    note: configured
      ? "PayPal credentials detected. This starter still uses the local safe capture flow until Orders API calls are enabled."
      : "No PayPal credentials found. Running an auditable simulated sandbox flow.",
  };
}

export async function createOrderForMandate(mandateId: string) {
  const db = getDb();
  const mandate = await getMandate(mandateId);
  if (!mandate) throw new Error("Mandate not found");
  if (mandate.status !== "APPROVED") {
    await recordAudit("PAYMENT_CREATE_BLOCKED", mandateId, { status: mandate.status });
    throw new Error("Mandate must be approved before PayPal order creation");
  }
  if (mandate.expiresAt.getTime() < Date.now()) {
    await db.update(mandates).set({ status: "EXPIRED" }).where(eq(mandates.id, mandateId));
    await recordAudit("PAYMENT_CREATE_BLOCKED", mandateId, { reason: "Mandate expired" });
    throw new Error("Mandate has expired");
  }

  const paypalOrderId = paymentId("SIM-PAYPAL-ORDER");
  const [{ id }] = await db
    .insert(transactions)
    .values({
      mandateId,
      paypalOrderId,
      amountCents: mandate.amountCents,
      currency: mandate.currency,
      status: "CREATED",
    })
    .$returningId();

  await recordAudit("PAYPAL_ORDER_CREATED", mandateId, { paypalOrderId, simulated: true });
  const [transaction] = await db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
  return { transaction, payPal: payPalMode() };
}

export async function captureOrderForMandate(input: { mandateId: string; paypalOrderId: string }) {
  const db = getDb();
  const mandate = await getMandate(input.mandateId);
  if (!mandate) throw new Error("Mandate not found");
  const [product] = await db.select().from(products).where(eq(products.id, mandate.productId)).limit(1);
  if (!product) throw new Error("Product not found");

  const [captured] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.mandateId, input.mandateId), eq(transactions.status, "CAPTURED")))
    .limit(1);
  if (captured) {
    await db.insert(transactions).values({
      mandateId: input.mandateId,
      paypalOrderId: input.paypalOrderId,
      amountCents: mandate.amountCents,
      currency: mandate.currency,
      status: "BLOCKED",
      duplicateAttempt: true,
      failureReason: "Duplicate capture attempt blocked",
    });
    await recordAudit("DUPLICATE_CAPTURE_BLOCKED", input.mandateId, {
      originalCaptureId: captured.captureId,
      attemptedPaypalOrderId: input.paypalOrderId,
    });
    return { captured: false, duplicate: true, errors: ["Duplicate payment blocked"], transaction: captured };
  }

  const [transaction] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.mandateId, input.mandateId), eq(transactions.paypalOrderId, input.paypalOrderId)))
    .orderBy(desc(transactions.createdAt))
    .limit(1);
  if (!transaction) throw new Error("PayPal order not found for mandate");

  const validation = validateMandateForCapture(mandate, product);
  if (!validation.allowed) {
    await db
      .update(transactions)
      .set({ status: "FAILED", failureReason: validation.errors.join("; ") })
      .where(eq(transactions.id, transaction.id));
    const nextStatus = mandate.expiresAt.getTime() < Date.now() ? "EXPIRED" : "REJECTED";
    await db.update(mandates).set({ status: nextStatus }).where(eq(mandates.id, mandate.id));
    await recordAudit("PAYMENT_CAPTURE_BLOCKED", input.mandateId, { errors: validation.errors });
    return { captured: false, duplicate: false, errors: validation.errors, transaction };
  }

  const captureId = paymentId("SIM-PAYPAL-CAPTURE");
  await db
    .update(transactions)
    .set({ status: "CAPTURED", captureId })
    .where(eq(transactions.id, transaction.id));
  await db.update(mandates).set({ status: "CAPTURED" }).where(eq(mandates.id, mandate.id));
  await recordAudit("PAYMENT_CAPTURED", input.mandateId, {
    paypalOrderId: input.paypalOrderId,
    captureId,
    simulated: true,
  });

  const [updated] = await db.select().from(transactions).where(eq(transactions.id, transaction.id)).limit(1);
  return { captured: true, duplicate: false, errors: [], transaction: updated };
}
