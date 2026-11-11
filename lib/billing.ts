import type { Customer, PaymentMethod, Product, Transaction, TransactionItem } from "@/lib/demo-data/types";

export interface BillDraftItem {
  productId: string;
  quantity: number;
}

export interface CalculatedBillLine {
  productId: string;
  productName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  availableStock: number;
  lineTotal: number;
}

export interface BillCalculation {
  lines: CalculatedBillLine[];
  subtotal: number;
  grandTotal: number;
  totalUnits: number;
}

export type BillValidationResult =
  | { ok: true; mergedItems: BillDraftItem[] }
  | { ok: false; error: string; offendingProductIds: string[] };

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Merge duplicate product rows cleanly so quantities are summed per product. */
export function mergeBillDraftItems(items: readonly BillDraftItem[]): BillDraftItem[] {
  const quantities = new Map<string, number>();
  for (const item of items) {
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
  }
  return [...quantities.entries()].map(([productId, quantity]) => ({ productId, quantity }));
}

export function calculateBill(
  draftItems: readonly BillDraftItem[],
  products: readonly Product[],
): BillCalculation {
  const byId = new Map(products.map((product) => [product.id, product]));
  const lines: CalculatedBillLine[] = [];
  let subtotal = 0;
  let totalUnits = 0;

  for (const item of draftItems) {
    const product = byId.get(item.productId);
    if (!product) {
      throw new Error(`Product ${item.productId} was not found in store inventory.`);
    }
    const safeQuantity = Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 0;
    const lineTotal = roundCurrency(safeQuantity * product.price);
    subtotal = roundCurrency(subtotal + lineTotal);
    totalUnits += safeQuantity;
    lines.push({
      productId: product.id,
      productName: product.name,
      unit: product.unit,
      quantity: safeQuantity,
      unitPrice: product.price,
      unitCost: product.costPrice,
      availableStock: product.stock,
      lineTotal,
    });
  }

  return {
    lines,
    subtotal,
    grandTotal: subtotal,
    totalUnits,
  };
}

/** Validates line quantities against available inventory and blocks overselling. */
export function validateBillItems(
  draftItems: readonly BillDraftItem[],
  products: readonly Product[],
): BillValidationResult {
  if (draftItems.length === 0) {
    return {
      ok: false,
      error: "Add at least one product to the bill before saving.",
      offendingProductIds: [],
    };
  }

  const byId = new Map(products.map((product) => [product.id, product]));
  for (const item of draftItems) {
    if (!item.productId) {
      return { ok: false, error: "Select a valid product for every bill line.", offendingProductIds: [] };
    }
    const product = byId.get(item.productId);
    if (!product) {
      return {
        ok: false,
        error: "One of the selected products is no longer in inventory.",
        offendingProductIds: [item.productId],
      };
    }
    if (!Number.isFinite(item.quantity) || !Number.isInteger(item.quantity) || item.quantity < 1) {
      return {
        ok: false,
        error: `Enter a valid whole-number quantity (at least 1) for ${product.name}.`,
        offendingProductIds: [product.id],
      };
    }
  }

  const mergedItems = mergeBillDraftItems(draftItems);
  const oversold: string[] = [];
  for (const item of mergedItems) {
    const product = byId.get(item.productId)!;
    if (item.quantity > product.stock) {
      oversold.push(product.name);
      return {
        ok: false,
        error: `Not enough stock for ${product.name} (available: ${product.stock}, requested: ${item.quantity}).`,
        offendingProductIds: [product.id],
      };
    }
  }

  return { ok: true, mergedItems };
}

/** Applies a sale's stock reduction to a product list after blocking any oversell. */
export function applySaleStockReduction(
  products: readonly Product[],
  items: readonly Pick<TransactionItem, "productId" | "quantity">[],
): Product[] {
  const validation = validateBillItems(items, products);
  if (!validation.ok) {
    throw new Error(validation.error);
  }
  const deductions = new Map(validation.mergedItems.map((item) => [item.productId, item.quantity]));
  return products.map((product) => {
    const deducted = deductions.get(product.id);
    if (!deducted) return product;
    return {
      ...product,
      stock: product.stock - deducted,
    };
  });
}

export function buildTransactionItems(
  draftItems: readonly BillDraftItem[],
  products: readonly Product[],
): TransactionItem[] {
  const { lines } = calculateBill(draftItems, products);
  return lines.map((line) => ({
    productId: line.productId,
    productName: line.productName,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    unitCost: line.unitCost,
  }));
}

export function formatBillingCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatReceiptText({
  businessName,
  transaction,
  customerName,
}: {
  businessName: string;
  transaction: Transaction;
  customerName: string;
}): string {
  const date = new Date(transaction.date);
  const formattedDate = Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(date)
    : transaction.date;

  const lines = [
    `*${businessName}*`,
    `Receipt: #${transaction.id.slice(0, 8).toUpperCase()}`,
    `Date: ${formattedDate}`,
    `Customer: ${customerName}`,
    `Payment: ${transaction.paymentMethod.toUpperCase()}`,
    "",
    ...transaction.items.map((item) => {
      const lineTotal = roundCurrency(item.quantity * item.unitPrice);
      return `- ${item.productName} x ${item.quantity} = ${formatBillingCurrency(lineTotal)}`;
    }),
    "",
    `*Grand Total: ${formatBillingCurrency(transaction.totalAmount)}*`,
    "Thank you for shopping with us!",
  ];

  return lines.join("\n");
}

function normalizeWhatsAppPhone(phone?: string): string {
  if (!phone) return "";
  const digits = phone.replace(/\D+/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return "";
}

export function buildWhatsAppReceiptUrl({
  businessName,
  transaction,
  customer,
}: {
  businessName: string;
  transaction: Transaction;
  customer?: Pick<Customer, "name" | "phone"> | null;
}): string {
  const customerName = customer?.name?.trim() || "Walk-in";
  const text = formatReceiptText({ businessName, transaction, customerName });
  const phone = normalizeWhatsAppPhone(customer?.phone);
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

export const PAYMENT_METHOD_OPTIONS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
];

