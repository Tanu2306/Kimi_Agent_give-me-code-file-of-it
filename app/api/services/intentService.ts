export type PurchaseIntent = {
  category: string;
  maxBudgetCents: number;
  currency: "USD";
  condition: "new" | "refurbished" | "used";
  merchantPolicy: "approved_only" | "any";
  autoPurchase: false;
  requiresApproval: true;
};

const CATEGORY_PATTERNS: Array<{ category: string; patterns: RegExp[] }> = [
  { category: "wireless keyboard", patterns: [/wireless keyboard/i, /keyboard/i] },
  { category: "wireless mouse", patterns: [/wireless mouse/i, /mouse/i] },
  { category: "monitor", patterns: [/monitor/i, /display/i] },
  { category: "laptop stand", patterns: [/laptop stand/i, /stand/i] },
  { category: "webcam", patterns: [/webcam/i, /camera/i] },
  { category: "headset", patterns: [/headset/i, /headphones/i] },
  { category: "usb hub", patterns: [/usb hub/i, /hub/i] },
  { category: "office chair", patterns: [/chair/i] },
];

function extractBudgetCents(message: string) {
  const underMatch = message.match(/(?:under|below|less than|up to|max(?:imum)?\s*(?:budget)?\s*(?:of)?|budget\s*(?:is|of)?)\s*\$?\s*(\d+(?:\.\d+)?)/i);
  const dollarMatch = message.match(/\$\s*(\d+(?:\.\d+)?)/);
  const raw = underMatch?.[1] ?? dollarMatch?.[1] ?? "40";
  return Math.round(Number(raw) * 100);
}

function extractCategory(message: string) {
  for (const candidate of CATEGORY_PATTERNS) {
    if (candidate.patterns.some((pattern) => pattern.test(message))) return candidate.category;
  }
  return "wireless keyboard";
}

function extractCondition(message: string): PurchaseIntent["condition"] {
  if (/refurbished|renewed/i.test(message)) return "refurbished";
  if (/used|second\s*hand/i.test(message)) return "used";
  return "new";
}

export function interpretPurchaseRequest(message: string): PurchaseIntent {
  return {
    category: extractCategory(message),
    maxBudgetCents: extractBudgetCents(message),
    currency: "USD",
    condition: extractCondition(message),
    merchantPolicy: /any seller|any merchant|all merchants/i.test(message) ? "any" : "approved_only",
    autoPurchase: false,
    requiresApproval: true,
  };
}
