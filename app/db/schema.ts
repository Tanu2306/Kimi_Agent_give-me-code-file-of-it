import {
  boolean,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const products = mysqlTable(
  "products",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description").notNull(),
    category: varchar("category", { length: 120 }).notNull(),
    priceCents: int("price_cents").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    merchantId: varchar("merchant_id", { length: 64 }).notNull(),
    merchantName: varchar("merchant_name", { length: 255 }).notNull(),
    condition: mysqlEnum("condition", ["new", "refurbished", "used"]).notNull(),
    approvedMerchant: boolean("approved_merchant").notNull().default(false),
    available: boolean("available").notNull().default(true),
    imageUrl: varchar("image_url", { length: 512 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    categoryIdx: index("products_category_idx").on(table.category),
    merchantIdx: index("products_merchant_idx").on(table.merchantId),
  }),
);

export const mandates = mysqlTable(
  "mandates",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: varchar("user_id", { length: 64 }).notNull().default("demo-user"),
    originalRequest: text("original_request").notNull(),
    category: varchar("category", { length: 120 }).notNull(),
    maxBudgetCents: int("max_budget_cents").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    condition: mysqlEnum("condition", ["new", "refurbished", "used"]).notNull(),
    merchantPolicy: mysqlEnum("merchant_policy", ["approved_only", "any"]).notNull(),
    productId: varchar("product_id", { length: 64 })
      .notNull()
      .references(() => products.id),
    merchantId: varchar("merchant_id", { length: 64 }).notNull(),
    amountCents: int("amount_cents").notNull(),
    status: mysqlEnum("status", [
      "PENDING_APPROVAL",
      "APPROVED",
      "BLOCKED",
      "EXPIRED",
      "CAPTURED",
      "REJECTED",
    ])
      .notNull()
      .default("PENDING_APPROVAL"),
    integrityHash: varchar("integrity_hash", { length: 128 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    approvedAt: timestamp("approved_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("mandates_user_idx").on(table.userId),
    statusIdx: index("mandates_status_idx").on(table.status),
  }),
);

export const transactions = mysqlTable(
  "transactions",
  {
    id: serial("id").primaryKey(),
    mandateId: varchar("mandate_id", { length: 64 })
      .notNull()
      .references(() => mandates.id),
    paypalOrderId: varchar("paypal_order_id", { length: 128 }),
    captureId: varchar("capture_id", { length: 128 }),
    amountCents: int("amount_cents").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    status: mysqlEnum("status", ["CREATED", "APPROVED", "CAPTURED", "BLOCKED", "FAILED", "SIMULATED"])
      .notNull()
      .default("CREATED"),
    duplicateAttempt: boolean("duplicate_attempt").notNull().default(false),
    failureReason: varchar("failure_reason", { length: 255 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    mandateIdx: index("transactions_mandate_idx").on(table.mandateId),
    paypalOrderIdx: index("transactions_paypal_order_idx").on(table.paypalOrderId),
  }),
);

export const auditEvents = mysqlTable(
  "audit_events",
  {
    id: serial("id").primaryKey(),
    mandateId: varchar("mandate_id", { length: 64 }),
    eventType: varchar("event_type", { length: 80 }).notNull(),
    eventData: json("event_data"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    mandateIdx: index("audit_mandate_idx").on(table.mandateId),
    typeIdx: index("audit_type_idx").on(table.eventType),
  }),
);

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;
export type Mandate = typeof mandates.$inferSelect;
export type InsertMandate = typeof mandates.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
