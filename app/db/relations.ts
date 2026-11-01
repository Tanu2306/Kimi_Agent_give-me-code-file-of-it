import { relations } from "drizzle-orm";
import { auditEvents, mandates, products, transactions } from "./schema";

export const productsRelations = relations(products, ({ many }) => ({
  mandates: many(mandates),
}));

export const mandatesRelations = relations(mandates, ({ one, many }) => ({
  product: one(products, { fields: [mandates.productId], references: [products.id] }),
  transactions: many(transactions),
  auditEvents: many(auditEvents),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  mandate: one(mandates, { fields: [transactions.mandateId], references: [mandates.id] }),
}));

export const auditEventsRelations = relations(auditEvents, ({ one }) => ({
  mandate: one(mandates, { fields: [auditEvents.mandateId], references: [mandates.id] }),
}));
