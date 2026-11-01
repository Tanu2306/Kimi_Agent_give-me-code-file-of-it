import { desc } from "drizzle-orm";
import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { auditEvents, mandates, transactions } from "@db/schema";
import { findCandidateProducts, getProductById, listProducts } from "../services/catalogService";
import { interpretPurchaseRequest } from "../services/intentService";
import { approveMandate, createMandateRecord, listMandates } from "../services/mandateService";
import { captureOrderForMandate, createOrderForMandate, payPalMode } from "../services/paymentService";
import { evaluateProductAgainstRules, validateMandateForCapture } from "../services/policyEngine";
import { recordAudit } from "../services/auditService";

const scenarioSchema = z.enum([
  "budget-manipulation",
  "unapproved-merchant",
  "product-substitution",
  "duplicate-payment",
  "expired-authorization",
  "webhook-forgery",
]);

async function buildDashboard() {
  const db = getDb();
  const [allMandates, allTransactions, allAuditEvents, allProducts] = await Promise.all([
    db.select().from(mandates).orderBy(desc(mandates.createdAt)).limit(50),
    db.select().from(transactions).orderBy(desc(transactions.createdAt)).limit(50),
    db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(80),
    listProducts(),
  ]);

  return {
    metrics: {
      totalMandates: allMandates.length,
      pendingApprovals: allMandates.filter((mandate) => mandate.status === "PENDING_APPROVAL").length,
      blockedAttempts:
        allMandates.filter((mandate) => ["BLOCKED", "REJECTED", "EXPIRED"].includes(mandate.status)).length +
        allTransactions.filter((transaction) => ["BLOCKED", "FAILED"].includes(transaction.status)).length,
      completedPayments: allTransactions.filter((transaction) => transaction.status === "CAPTURED").length,
      products: allProducts.length,
    },
    mandates: allMandates,
    transactions: allTransactions,
    auditEvents: allAuditEvents,
    products: allProducts,
    payPal: payPalMode(),
  };
}

async function createApprovedDemoMandate() {
  const intent = interpretPurchaseRequest("Find a wireless mouse under $30 from an approved seller");
  const product = await getProductById("MOU-001");
  if (!product) throw new Error("Demo product missing");
  const created = await createMandateRecord({ originalRequest: "Security Lab demo", intent, product });
  if (!created.mandate) throw new Error("Failed to create demo mandate");
  const approved = await approveMandate(created.mandate.id);
  if (!approved.approved || !approved.mandate) throw new Error("Failed to approve demo mandate");
  return approved.mandate;
}

export const intentlockRouter = createRouter({
  dashboard: publicQuery.query(() => buildDashboard()),

  catalog: publicQuery.query(async () => ({ products: await listProducts(), payPal: payPalMode() })),

  interpret: publicQuery
    .input(z.object({ message: z.string().min(3).max(500) }))
    .mutation(async ({ input }) => {
      const intent = interpretPurchaseRequest(input.message);
      const matches = (await findCandidateProducts(intent)).map((product) => ({
        ...product,
        policy: evaluateProductAgainstRules(product, intent),
      }));
      return { intent, products: matches };
    }),

  createMandate: publicQuery
    .input(z.object({ message: z.string().min(3).max(500), productId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const intent = interpretPurchaseRequest(input.message);
      const product = await getProductById(input.productId);
      if (!product) throw new Error("Product not found");
      return createMandateRecord({ originalRequest: input.message, intent, product });
    }),

  approveMandate: publicQuery
    .input(z.object({ mandateId: z.string().min(1) }))
    .mutation(({ input }) => approveMandate(input.mandateId)),

  createOrder: publicQuery
    .input(z.object({ mandateId: z.string().min(1) }))
    .mutation(({ input }) => createOrderForMandate(input.mandateId)),

  captureOrder: publicQuery
    .input(z.object({ mandateId: z.string().min(1), paypalOrderId: z.string().min(1) }))
    .mutation(({ input }) => captureOrderForMandate(input)),

  mandates: publicQuery.query(() => listMandates()),

  runSecurityScenario: publicQuery
    .input(z.object({ scenario: scenarioSchema }))
    .mutation(async ({ input }) => {
      if (input.scenario === "budget-manipulation") {
        const intent = interpretPurchaseRequest("Find a wireless mouse under $30 from an approved seller");
        const product = await getProductById("MOU-002");
        if (!product) throw new Error("Demo product missing");
        const result = await createMandateRecord({ originalRequest: "Security Lab: budget manipulation", intent, product });
        return { scenario: input.scenario, allowed: false, result: result.policy, mandate: result.mandate };
      }

      if (input.scenario === "unapproved-merchant") {
        const intent = interpretPurchaseRequest("Find a wireless mouse under $30 from an approved seller");
        const product = await getProductById("MOU-003");
        if (!product) throw new Error("Demo product missing");
        const result = await createMandateRecord({ originalRequest: "Security Lab: unapproved merchant", intent, product });
        return { scenario: input.scenario, allowed: false, result: result.policy, mandate: result.mandate };
      }

      if (input.scenario === "product-substitution") {
        const mandate = await createApprovedDemoMandate();
        const substituted = await getProductById("MOU-002");
        if (!substituted) throw new Error("Demo product missing");
        const validation = validateMandateForCapture(mandate, substituted);
        await recordAudit("PRODUCT_SUBSTITUTION_BLOCKED", mandate.id, validation);
        return { scenario: input.scenario, allowed: validation.allowed, result: validation, mandate };
      }

      if (input.scenario === "duplicate-payment") {
        const mandate = await createApprovedDemoMandate();
        const order = await createOrderForMandate(mandate.id);
        const first = await captureOrderForMandate({ mandateId: mandate.id, paypalOrderId: order.transaction.paypalOrderId! });
        const second = await captureOrderForMandate({ mandateId: mandate.id, paypalOrderId: order.transaction.paypalOrderId! });
        return { scenario: input.scenario, allowed: false, result: { first, second }, mandate };
      }

      if (input.scenario === "expired-authorization") {
        const intent = interpretPurchaseRequest("Find a wireless mouse under $30 from an approved seller");
        const product = await getProductById("MOU-001");
        if (!product) throw new Error("Demo product missing");
        const expired = await createMandateRecord({
          originalRequest: "Security Lab: expired authorization",
          intent,
          product,
          expiresAt: new Date(Date.now() - 60_000),
        });
        if (!expired.mandate) throw new Error("Failed to create expired mandate");
        const approval = await approveMandate(expired.mandate.id);
        return { scenario: input.scenario, allowed: approval.approved, result: approval, mandate: approval.mandate };
      }

      await recordAudit("WEBHOOK_FORGERY_BLOCKED", null, {
        reason: "Signature verification failed",
        simulatedPayload: { event_type: "PAYMENT.CAPTURE.COMPLETED" },
      });
      return {
        scenario: input.scenario,
        allowed: false,
        result: { errors: ["Webhook signature verification failed"], verified: false },
      };
    }),
});
