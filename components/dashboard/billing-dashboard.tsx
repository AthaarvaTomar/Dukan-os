"use client";

import {
  AlertCircle,
  LoaderCircle,
  MessageCircle,
  Plus,
  Printer,
  Receipt,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useBusinessInfo } from "@/components/dashboard/business-context";
import { useDemoStore } from "@/components/dashboard/use-demo-store";
import { Button } from "@/components/ui/button";
import {
  buildTransactionItems,
  buildWhatsAppReceiptUrl,
  calculateBill,
  formatBillingCurrency,
  PAYMENT_METHOD_OPTIONS,
  validateBillItems,
  type BillDraftItem,
} from "@/lib/billing";
import { segmentCustomers } from "@/lib/demo-data/analytics";
import type { PaymentMethod, Transaction } from "@/lib/demo-data/types";

const SEGMENT_LABELS: Record<string, string> = {
  regular: "Regular",
  inactive: "Inactive",
  new: "New",
  "high-value": "High value",
};

function formatBillDateTime(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function summarizeItems(transaction: Transaction): string {
  if (transaction.items.length === 0) return "No line items";
  const shown = transaction.items
    .slice(0, 3)
    .map((item) => `${item.productName} × ${item.quantity}`)
    .join(", ");
  return transaction.items.length > 3
    ? `${shown} +${transaction.items.length - 3} more`
    : shown;
}

function paymentLabel(method: PaymentMethod): string {
  return PAYMENT_METHOD_OPTIONS.find((option) => option.value === method)?.label ?? method.toUpperCase();
}

export function BillingDashboard() {
  const { businessName } = useBusinessInfo();
  const { data, status, error, createSale, reset } = useDemoStore();

  const [customerId, setCustomerId] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantityInput, setQuantityInput] = useState("1");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [draftItems, setDraftItems] = useState<BillDraftItem[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeReceipt, setActiveReceipt] = useState<Transaction | null>(null);

  const sortedCustomers = useMemo(
    () =>
      segmentCustomers(data.customers, data.transactions, new Date(data.asOf)).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    [data.asOf, data.customers, data.transactions],
  );

  const customersById = useMemo(
    () => new Map(sortedCustomers.map((customer) => [customer.id, customer])),
    [sortedCustomers],
  );

  const sortedProducts = useMemo(
    () => [...data.products].sort((a, b) => a.name.localeCompare(b.name)),
    [data.products],
  );

  const productsById = useMemo(
    () => new Map(data.products.map((product) => [product.id, product])),
    [data.products],
  );

  const selectedCustomer = customerId ? customersById.get(customerId) ?? null : null;

  const billCalculation = useMemo(() => {
    const validDrafts = draftItems.filter((item) => productsById.has(item.productId));
    return calculateBill(validDrafts, data.products);
  }, [data.products, draftItems, productsById]);

  const draftValidation = useMemo(() => {
    if (draftItems.length === 0) return null;
    return validateBillItems(draftItems, data.products);
  }, [data.products, draftItems]);

  const recentBills = useMemo(
    () =>
      [...data.transactions]
        .sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || b.date.localeCompare(a.date))
        .slice(0, 20),
    [data.transactions],
  );

  const receiptCustomer = useMemo(() => {
    if (!activeReceipt?.customerId) return null;
    return customersById.get(activeReceipt.customerId) ?? null;
  }, [activeReceipt, customersById]);

  const activeReceiptWhatsAppUrl = useMemo(() => {
    if (!activeReceipt) return "";
    return buildWhatsAppReceiptUrl({
      businessName,
      transaction: activeReceipt,
      customer: receiptCustomer,
    });
  }, [activeReceipt, businessName, receiptCustomer]);

  const handleAddItem = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const productId = selectedProductId || sortedProducts[0]?.id || "";
    const product = productsById.get(productId);
    if (!product) {
      const message = "Add a product in Inventory before creating a bill.";
      setFormError(message);
      toast.error(message);
      return;
    }

    const parsedQuantity = Number(quantityInput);
    if (!Number.isFinite(parsedQuantity) || !Number.isInteger(parsedQuantity) || parsedQuantity < 1) {
      const message = "Enter a valid whole-number quantity of at least 1.";
      setFormError(message);
      toast.error(message);
      return;
    }

    const existingQty = draftItems.find((item) => item.productId === product.id)?.quantity ?? 0;
    const nextQty = existingQty + parsedQuantity;
    if (nextQty > product.stock) {
      const message = `Not enough stock for ${product.name} (available: ${product.stock}, requested: ${nextQty}).`;
      setFormError(message);
      toast.error(message);
      return;
    }

    setDraftItems((current) => {
      const exists = current.some((item) => item.productId === product.id);
      if (exists) {
        return current.map((item) =>
          item.productId === product.id ? { ...item, quantity: item.quantity + parsedQuantity } : item,
        );
      }
      return [...current, { productId: product.id, quantity: parsedQuantity }];
    });
    setQuantityInput("1");
  };

  const updateLineQuantity = (productId: string, rawValue: string) => {
    setFormError(null);
    const parsed = Number(rawValue);
    const safeQuantity = Number.isFinite(parsed) ? Math.floor(parsed) : 0;
    setDraftItems((current) =>
      current.map((item) => (item.productId === productId ? { ...item, quantity: safeQuantity } : item)),
    );
  };

  const removeLine = (productId: string) => {
    setFormError(null);
    setDraftItems((current) => current.filter((item) => item.productId !== productId));
  };

  const handleSaveBill = async () => {
    if (saving) return;
    setFormError(null);

    const validation = validateBillItems(draftItems, data.products);
    if (!validation.ok) {
      setFormError(validation.error);
      toast.error(validation.error);
      return;
    }

    const items = buildTransactionItems(validation.mergedItems, data.products);
    setSaving(true);
    try {
      const result = await createSale({
        customerId,
        date: new Date().toISOString(),
        items,
        discount: 0,
        paymentMethod,
        status: "completed",
      });

      if (!result.ok) {
        setFormError(result.error);
        toast.error(result.error);
        return;
      }

      setActiveReceipt(result.transaction);
      setDraftItems([]);
      setCustomerId("");
      setSelectedProductId("");
      setQuantityInput("1");
      setFormError(null);
      const savedCustomerName = result.transaction.customerId
        ? customersById.get(result.transaction.customerId)?.name ?? "Customer"
        : "Walk-in";
      toast.success(
        `Bill saved for ${savedCustomerName} (${formatBillingCurrency(result.transaction.totalAmount)})`,
      );
    } finally {
      setSaving(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="mx-auto w-full max-w-[1440px] animate-pulse space-y-6" role="status">
        <span className="sr-only">Loading billing…</span>
        <div className="h-9 w-48 rounded bg-slate-200" />
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="h-96 rounded-2xl bg-white lg:col-span-7" />
          <div className="h-96 rounded-2xl bg-white lg:col-span-5" />
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <section role="alert" className="mx-auto max-w-2xl rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">We couldn&apos;t load billing data</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {error ?? "The store data service is temporarily unavailable."}
        </p>
        <Button className="mt-5" onClick={() => void reset()}>
          Retry loading data
        </Button>
      </section>
    );
  }

  const effectiveProductId = selectedProductId || sortedProducts[0]?.id || "";

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-7">
      <section className="print:hidden">
        <p className="mb-2 text-sm font-medium text-slate-500">Point of sale</p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-[30px]">
          Billing
        </h1>
        <p className="mt-1.5 text-sm text-slate-500">
          Create a quick bill for {businessName}, update stock, and share a receipt.
        </p>
      </section>

      <div className="grid gap-6 xl:grid-cols-12">
        {/* New Sale Form */}
        <section
          aria-label="New sale"
          className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_8px_rgba(15,23,42,0.025)] print:hidden sm:p-6 xl:col-span-7"
        >
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">New sale</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Select a customer or Walk-in, then add products from inventory.
              </p>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <Receipt size={18} aria-hidden="true" />
            </span>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-medium text-slate-600">
              Customer
              <select
                value={customerId}
                disabled={saving}
                onChange={(event) => {
                  setCustomerId(event.target.value);
                  setFormError(null);
                }}
                className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:opacity-50"
              >
                <option value="">Walk-in</option>
                {sortedCustomers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                    {customer.phone ? ` (${customer.phone})` : ""}
                  </option>
                ))}
              </select>
            </label>

            <div>
              <span className="block text-xs font-medium text-slate-600">Payment method</span>
              <div className="mt-1.5 grid grid-cols-3 gap-2" role="group" aria-label="Payment method">
                {PAYMENT_METHOD_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    disabled={saving}
                    onClick={() => setPaymentMethod(option.value)}
                    aria-pressed={paymentMethod === option.value}
                    className={`h-10 rounded-xl border text-xs font-medium transition-colors disabled:opacity-50 ${
                      paymentMethod === option.value
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {selectedCustomer && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
              <span>
                Segment:{" "}
                <strong className="font-semibold text-slate-900">
                  {SEGMENT_LABELS[selectedCustomer.segment] ?? selectedCustomer.segment}
                </strong>
              </span>
              <span>
                Orders:{" "}
                <strong className="font-semibold text-slate-900">
                  {selectedCustomer.transactionCount}
                </strong>
              </span>
              <span>
                Total spent:{" "}
                <strong className="font-semibold text-slate-900">
                  {formatBillingCurrency(selectedCustomer.totalSpent)}
                </strong>
              </span>
            </div>
          )}

          <form onSubmit={handleAddItem} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1 text-xs font-medium text-slate-600">
              Product
              <select
                value={effectiveProductId}
                disabled={saving || sortedProducts.length === 0}
                onChange={(event) => {
                  setSelectedProductId(event.target.value);
                  setFormError(null);
                }}
                className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:opacity-50"
              >
                {sortedProducts.length === 0 ? (
                  <option value="">No products in inventory</option>
                ) : (
                  sortedProducts.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} — {formatBillingCurrency(product.price)} ({product.stock} {product.unit} left)
                    </option>
                  ))
                )}
              </select>
            </label>

            <label className="w-full text-xs font-medium text-slate-600 sm:w-28">
              Quantity
              <input
                type="number"
                min={1}
                step={1}
                disabled={saving || sortedProducts.length === 0}
                value={quantityInput}
                onChange={(event) => {
                  setQuantityInput(event.target.value);
                  setFormError(null);
                }}
                className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:opacity-50"
              />
            </label>

            <Button
              type="submit"
              variant="outline"
              disabled={saving || sortedProducts.length === 0}
              className="h-10 rounded-xl"
            >
              <Plus size={16} aria-hidden="true" />
              Add item
            </Button>
          </form>

          {(formError || (draftValidation && !draftValidation.ok)) && (
            <p
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700"
            >
              <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{formError ?? (!draftValidation?.ok ? draftValidation?.error : "")}</span>
            </p>
          )}

          {/* Draft Line Items */}
          <div className="mt-5 overflow-hidden rounded-xl border border-slate-200/80">
            {billCalculation.lines.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-medium text-slate-700">No items added yet</p>
                <p className="mt-1 text-xs text-slate-500">
                  Pick a product above to start building the bill.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-medium text-slate-500">
                    <tr>
                      <th scope="col" className="px-4 py-3">Item</th>
                      <th scope="col" className="px-3 py-3 text-right">Price</th>
                      <th scope="col" className="px-3 py-3 text-center">Qty</th>
                      <th scope="col" className="px-3 py-3 text-right">Line total</th>
                      <th scope="col" className="px-3 py-3 text-right">
                        <span className="sr-only">Remove</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {billCalculation.lines.map((line) => {
                      const exceedsStock = line.quantity > line.availableStock;
                      const invalidQty = line.quantity < 1;
                      return (
                        <tr key={line.productId} className={exceedsStock ? "bg-rose-50/50" : undefined}>
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-900">{line.productName}</p>
                            <p className={`text-xs ${exceedsStock ? "font-medium text-rose-600" : "text-slate-500"}`}>
                              {line.availableStock} {line.unit} in stock
                            </p>
                          </td>
                          <td className="px-3 py-3 text-right text-slate-600">
                            {formatBillingCurrency(line.unitPrice)}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <input
                              type="number"
                              min={1}
                              step={1}
                              aria-label={`Quantity for ${line.productName}`}
                              disabled={saving}
                              value={line.quantity > 0 ? line.quantity : ""}
                              onChange={(event) => updateLineQuantity(line.productId, event.target.value)}
                              className={`h-9 w-20 rounded-lg border bg-white px-2 text-center text-sm outline-none focus:ring-2 ${
                                exceedsStock || invalidQty
                                  ? "border-rose-400 text-rose-700 focus:ring-rose-200"
                                  : "border-slate-200 text-slate-800 focus:border-slate-400 focus:ring-slate-200"
                              }`}
                            />
                          </td>
                          <td className="px-3 py-3 text-right font-semibold text-slate-900">
                            {formatBillingCurrency(line.lineTotal)}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <button
                              type="button"
                              disabled={saving}
                              aria-label={`Remove ${line.productName}`}
                              onClick={() => removeLine(line.productId)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-rose-600 disabled:opacity-50"
                            >
                              <Trash2 size={15} aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-5 flex flex-col gap-4 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs text-slate-500">
                {billCalculation.lines.length} items · {billCalculation.totalUnits} units
              </p>
              <p className="mt-0.5 text-xl font-semibold tracking-tight text-slate-900">
                Grand total: {formatBillingCurrency(billCalculation.grandTotal)}
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              {draftItems.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => {
                    setDraftItems([]);
                    setFormError(null);
                  }}
                >
                  Clear
                </Button>
              )}
              <Button
                type="button"
                disabled={saving || draftItems.length === 0}
                onClick={() => void handleSaveBill()}
                className="min-w-[140px]"
              >
                {saving ? (
                  <>
                    <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
                    Saving bill…
                  </>
                ) : (
                  "Save bill"
                )}
              </Button>
            </div>
          </div>
        </section>

        {/* Simple Receipt Card (Printed cleanly on window.print) */}
        <section
          aria-label="Receipt"
          className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_8px_rgba(15,23,42,0.025)] print:border-0 print:p-0 print:shadow-none sm:p-6 xl:col-span-5"
        >
          {activeReceipt ? (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-3 border-b border-dashed border-slate-200 pb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Receipt
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-slate-900">{businessName}</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    #{activeReceipt.id.slice(0, 8).toUpperCase()} · {formatBillDateTime(activeReceipt.date)}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close receipt"
                  onClick={() => setActiveReceipt(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 print:hidden"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                <div>
                  <span className="text-slate-400">Customer: </span>
                  <span className="font-medium text-slate-900">
                    {receiptCustomer?.name ?? "Walk-in"}
                  </span>
                  {receiptCustomer?.phone ? ` (${receiptCustomer.phone})` : ""}
                </div>
                <div>
                  <span className="text-slate-400">Payment: </span>
                  <span className="font-medium text-slate-900">
                    {paymentLabel(activeReceipt.paymentMethod)}
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto border-y border-dashed border-slate-200 py-3">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="text-xs text-slate-500">
                    <tr>
                      <th scope="col" className="pb-2 font-medium">Item</th>
                      <th scope="col" className="pb-2 text-right font-medium">Qty</th>
                      <th scope="col" className="pb-2 text-right font-medium">Rate</th>
                      <th scope="col" className="pb-2 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeReceipt.items.map((item, idx) => (
                      <tr key={`${item.productId || item.productName}-${idx}`}>
                        <td className="py-2 pr-2 font-medium text-slate-800">{item.productName}</td>
                        <td className="py-2 text-right text-slate-600">{item.quantity}</td>
                        <td className="py-2 text-right text-slate-600">
                          {formatBillingCurrency(item.unitPrice)}
                        </td>
                        <td className="py-2 text-right font-medium text-slate-900">
                          {formatBillingCurrency(item.quantity * item.unitPrice)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between text-base font-semibold text-slate-900">
                <span>Grand total</span>
                <span>{formatBillingCurrency(activeReceipt.totalAmount)}</span>
              </div>

              <div className="flex flex-col gap-2.5 pt-1 print:hidden sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => window.print()}
                >
                  <Printer size={16} aria-hidden="true" />
                  Print
                </Button>
                <a
                  href={activeReceiptWhatsAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                >
                  <MessageCircle size={16} aria-hidden="true" />
                  Share on WhatsApp
                </a>
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-[280px] flex-col items-center justify-center text-center print:hidden">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-50 text-slate-400">
                <Receipt size={22} aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-sm font-semibold text-slate-900">No receipt selected</h2>
              <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">
                Save a new bill or click Receipt on a recent bill below to print or share on WhatsApp.
              </p>
            </div>
          )}
        </section>
      </div>

      {/* Recent Bills List */}
      <section
        aria-label="Recent bills"
        className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.025)] print:hidden"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
          <div>
            <h2 className="font-semibold text-slate-900">Recent bills</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Latest {recentBills.length} of {data.transactions.length} saved bills
            </p>
          </div>
        </div>

        {recentBills.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-medium text-slate-700">No bills recorded yet</p>
            <p className="mt-1 text-xs text-slate-500">
              Your saved sales will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead className="bg-slate-50/80 text-xs font-medium text-slate-500">
                <tr>
                  <th scope="col" className="px-6 py-3.5">Date</th>
                  <th scope="col" className="px-4 py-3.5">Customer</th>
                  <th scope="col" className="px-4 py-3.5">Items</th>
                  <th scope="col" className="px-4 py-3.5">Payment</th>
                  <th scope="col" className="px-4 py-3.5 text-right">Total</th>
                  <th scope="col" className="px-6 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {recentBills.map((bill) => {
                  const customer = bill.customerId ? customersById.get(bill.customerId) : null;
                  const isActive = activeReceipt?.id === bill.id;
                  return (
                    <tr
                      key={bill.id}
                      className={`transition-colors hover:bg-slate-50/70 ${isActive ? "bg-lime-50/40" : ""}`}
                    >
                      <td className="whitespace-nowrap px-6 py-3.5 text-xs text-slate-500">
                        {formatBillDateTime(bill.date)}
                      </td>
                      <td className="px-4 py-3.5 font-medium text-slate-900">
                        {customer?.name ?? (bill.customerId ? "Customer" : "Walk-in")}
                      </td>
                      <td className="max-w-xs truncate px-4 py-3.5 text-xs text-slate-600">
                        {summarizeItems(bill)}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                          {paymentLabel(bill.paymentMethod)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right font-semibold text-slate-900">
                        {formatBillingCurrency(bill.totalAmount)}
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setActiveReceipt(bill)}
                        >
                          Receipt
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

