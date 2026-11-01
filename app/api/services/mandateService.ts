import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { mandates, products, type Product } from "@db/schema";
import type { PurchaseIntent } from "./intentService";
import { evaluateProductAgainstRules, mandatePayload, validateMandateForCapture } from "./policyEngine";
import { signCanonicalPayload } from "./integrity";
import { recordAudit } from "./auditService";

const MANDATE_TTL_MS = 15 * 60 * 1000;

export function makeMandateId() {
  return `MND-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function getMandate(mandateId: string) {
  const [mandate] = await getDb().select().from(mandates).where(eq(mandates.id, mandateId)).limit(1);
  return mandate;
}

export async function createMandateRecord(input: {
  originalRequest: string;
  intent: PurchaseIntent;
  product: Product;
  expiresAt?: Date;
}) {
  const { originalRequest, intent, product } = input;
  const policy = evaluateProductAgainstRules(product, intent);
  const id = makeMandateId();
  const rawExpiresAt = input.expiresAt ?? new Date(Date.now() + MANDATE_TTL_MS);
  const expiresAt = new Date(Math.floor(rawExpiresAt.getTime() / 1000) * 1000);
  const basePayload = {
    mandateId: id,
    userId: "demo-user",
    productId: product.id,
    merchantId: product.merchantId,
    amountCents: product.priceCents,
    currency: product.currency,
    expiresAt: expiresAt.toISOString(),
  };

  const mandateValues = {
    id,
    userId: "demo-user",
    originalRequest,
    category: intent.category,
    maxBudgetCents: intent.maxBudgetCents,
    currency: intent.currency,
    condition: intent.condition,
    merchantPolicy: intent.merchantPolicy,
    productId: product.id,
    merchantId: product.merchantId,
    amountCents: product.priceCents,
    status: policy.allowed ? ("PENDING_APPROVAL" as const) : ("BLOCKED" as const),
    integrityHash: signCanonicalPayload(basePayload),
    idempotencyKey: randomUUID(),
    expiresAt,
  };

  await getDb().insert(mandates).values(mandateValues);
  await recordAudit(policy.allowed ? "MANDATE_CREATED" : "MANDATE_BLOCKED", id, {
    policy,
    intent,
    productId: product.id,
  });

  const mandate = await getMandate(id);
  return { mandate, policy };
}

export async function approveMandate(mandateId: string) {
  const db = getDb();
  const mandate = await getMandate(mandateId);
  if (!mandate) throw new Error("Mandate not found");
  const [product] = await db.select().from(products).where(eq(products.id, mandate.productId)).limit(1);
  if (!product) throw new Error("Mandate product not found");

  if (mandate.expiresAt.getTime() < Date.now()) {
    await db.update(mandates).set({ status: "EXPIRED" }).where(eq(mandates.id, mandateId));
    await recordAudit("MANDATE_EXPIRED", mandateId, { attemptedApproval: true });
    return { mandate: await getMandate(mandateId), approved: false, errors: ["Mandate has expired"] };
  }

  if (mandate.status !== "PENDING_APPROVAL") {
    return { mandate, approved: false, errors: [`Mandate status is ${mandate.status}`] };
  }

  const integrity = validateMandateForCapture({ ...mandate, status: "APPROVED" }, product);
  const errors = integrity.errors.filter((error) => error !== "Mandate is not approved");
  if (!integrity.allowed && errors.length > 0) {
    await db.update(mandates).set({ status: "REJECTED" }).where(eq(mandates.id, mandateId));
    await recordAudit("MANDATE_REJECTED", mandateId, { errors });
    return { mandate: await getMandate(mandateId), approved: false, errors };
  }

  await db
    .update(mandates)
    .set({ status: "APPROVED", approvedAt: new Date() })
    .where(eq(mandates.id, mandateId));
  await recordAudit("MANDATE_APPROVED", mandateId, {
    approvedAt: new Date().toISOString(),
    payload: mandatePayload({ ...mandate, status: "APPROVED" }),
  });

  return { mandate: await getMandate(mandateId), approved: true, errors: [] };
}

export async function listMandates(limit = 20) {
  return getDb().select().from(mandates).orderBy(mandates.createdAt).limit(limit);
}
