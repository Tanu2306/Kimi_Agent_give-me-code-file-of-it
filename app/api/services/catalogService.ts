import { eq, sql } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { products, type InsertProduct, type Product } from "@db/schema";
import type { PurchaseIntent } from "./intentService";

export const DEMO_PRODUCTS: InsertProduct[] = [
  {
    id: "KEY-001",
    name: "Aurora K380 Wireless Keyboard",
    description: "Compact multi-device keyboard with quiet low-profile keys.",
    category: "wireless keyboard",
    priceCents: 3200,
    currency: "USD",
    merchantId: "STORE_A",
    merchantName: "Approved Store A",
    condition: "new",
    approvedMerchant: true,
    available: true,
    imageUrl: "",
  },
  {
    id: "KEY-002",
    name: "Nimbus Mechanical Wireless Keyboard",
    description: "Hot-swappable wireless keyboard with aluminum frame.",
    category: "wireless keyboard",
    priceCents: 4800,
    currency: "USD",
    merchantId: "STORE_A",
    merchantName: "Approved Store A",
    condition: "new",
    approvedMerchant: true,
    available: true,
    imageUrl: "",
  },
  {
    id: "KEY-003",
    name: "Refurbished Flex Wireless Keyboard",
    description: "Refurbished compact keyboard with 90-day warranty.",
    category: "wireless keyboard",
    priceCents: 2900,
    currency: "USD",
    merchantId: "STORE_B",
    merchantName: "Marketplace Seller B",
    condition: "refurbished",
    approvedMerchant: true,
    available: true,
    imageUrl: "",
  },
  {
    id: "KEY-004",
    name: "Orbit Slim Wireless Keyboard",
    description: "Slim wireless keyboard from an unapproved marketplace seller.",
    category: "wireless keyboard",
    priceCents: 2600,
    currency: "USD",
    merchantId: "STORE_X",
    merchantName: "Unknown Seller X",
    condition: "new",
    approvedMerchant: false,
    available: true,
    imageUrl: "",
  },
  {
    id: "MOU-001",
    name: "Pulse Wireless Mouse",
    description: "Ergonomic wireless mouse with silent switches.",
    category: "wireless mouse",
    priceCents: 2400,
    currency: "USD",
    merchantId: "STORE_A",
    merchantName: "Approved Store A",
    condition: "new",
    approvedMerchant: true,
    available: true,
    imageUrl: "",
  },
  {
    id: "MOU-002",
    name: "Vector Pro Wireless Mouse",
    description: "High-precision wireless mouse for design work.",
    category: "wireless mouse",
    priceCents: 4500,
    currency: "USD",
    merchantId: "STORE_A",
    merchantName: "Approved Store A",
    condition: "new",
    approvedMerchant: true,
    available: true,
    imageUrl: "",
  },
  {
    id: "MOU-003",
    name: "Budget Wireless Mouse",
    description: "Low-cost wireless mouse from an unverified seller.",
    category: "wireless mouse",
    priceCents: 1800,
    currency: "USD",
    merchantId: "STORE_X",
    merchantName: "Unknown Seller X",
    condition: "new",
    approvedMerchant: false,
    available: true,
    imageUrl: "",
  },
  {
    id: "MON-001",
    name: "Clarity 27 Monitor",
    description: "27-inch QHD monitor with USB-C input.",
    category: "monitor",
    priceCents: 18900,
    currency: "USD",
    merchantId: "STORE_A",
    merchantName: "Approved Store A",
    condition: "new",
    approvedMerchant: true,
    available: true,
    imageUrl: "",
  },
  {
    id: "STD-001",
    name: "Elevate Laptop Stand",
    description: "Adjustable aluminum laptop stand.",
    category: "laptop stand",
    priceCents: 3900,
    currency: "USD",
    merchantId: "STORE_A",
    merchantName: "Approved Store A",
    condition: "new",
    approvedMerchant: true,
    available: true,
    imageUrl: "",
  },
  {
    id: "CAM-001",
    name: "Focus 1080p Webcam",
    description: "1080p webcam with privacy shutter.",
    category: "webcam",
    priceCents: 5400,
    currency: "USD",
    merchantId: "STORE_A",
    merchantName: "Approved Store A",
    condition: "new",
    approvedMerchant: true,
    available: true,
    imageUrl: "",
  },
];

export async function ensureCatalogSeeded() {
  const db = getDb();
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(products);
  if (Number(count) > 0) return;
  await db.insert(products).values(DEMO_PRODUCTS);
}

export async function listProducts() {
  await ensureCatalogSeeded();
  return getDb().select().from(products);
}

export async function getProductById(productId: string) {
  await ensureCatalogSeeded();
  const [product] = await getDb().select().from(products).where(eq(products.id, productId)).limit(1);
  return product;
}

export async function findCandidateProducts(intent: PurchaseIntent): Promise<Product[]> {
  const allProducts = await listProducts();
  const terms = intent.category.toLowerCase().split(/\s+/);
  return allProducts.filter((product) => {
    const haystack = `${product.name} ${product.description} ${product.category}`.toLowerCase();
    return terms.every((term) => haystack.includes(term)) || haystack.includes(intent.category.toLowerCase());
  });
}
