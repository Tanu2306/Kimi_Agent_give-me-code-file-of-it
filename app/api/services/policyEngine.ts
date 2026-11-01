import type { Mandate, Product } from "@db/schema";
import { canonicalize, verifyCanonicalPayload } from "./integrity";

export type PurchaseRules = {
  maxBudgetCents: number;
  condition: Product["condition"];
  merchantPolicy: "approved_only" | "any";
  currency: string;
};

export function evaluateProductAgainstRules(product: Product, rules: PurchaseRules) {
  const errors: string[] = [];

  if (!product.available) errors.push("Product is unavailable");
  if (product.currency !== rules.currency) errors.push("Currency mismatch");
  if (product.priceCents > rules.maxBudgetCents) errors.push("Budget exceeded");
  if (product.condition !== rules.condition) errors.push("Product condition not allowed");
  if (rules.merchantPolicy === "approved_only" && !product.approvedMerchant) {
    errors.push("Merchant is not approved");
  }

  return { allowed: errors.length === 0, errors };
}

export function mandatePayload(mandate: Mandate) {
  return {
    mandateId: mandate.id,
    userId: mandate.userId,
    productId: mandate.productId,
    merchantId: mandate.merchantId,
    amountCents: mandate.amountCents,
    currency: mandate.currency,
    expiresAt: new Date(Math.floor(mandate.expiresAt.getTime() / 1000) * 1000).toISOString(),
  };
}

export function validateMandateForCapture(mandate: Mandate, product: Product) {
  const errors: string[] = [];
  if (mandate.status !== "APPROVED") errors.push("Mandate is not approved");
  if (mandate.expiresAt.getTime() < Date.now()) errors.push("Mandate has expired");
  if (mandate.productId !== product.id) errors.push("Product substitution detected");
  if (mandate.merchantId !== product.merchantId) errors.push("Merchant substitution detected");
  if (mandate.amountCents !== product.priceCents) errors.push("Price changed after approval");
  if (mandate.currency !== product.currency) errors.push("Currency changed after approval");
  if (!verifyCanonicalPayload(mandatePayload(mandate), mandate.integrityHash)) {
    errors.push("Mandate integrity check failed");
  }
  return { allowed: errors.length === 0, errors };
}

export function explainMandate(mandate: Mandate) {
  return canonicalize(mandatePayload(mandate));
}
