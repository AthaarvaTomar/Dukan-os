"use client";

import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ClipboardList,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useDemoStore } from "@/components/dashboard/use-demo-store";
import { inventoryMetrics, inventoryRecommendations } from "@/lib/demo-data/inventory";
import type {
  InventoryMovement,
  Product,
  ProductCategory,
  StockOperation,
  SupplierOrderDraft,
  SupplierOrderItem,
} from "@/lib/demo-data/types";

const categories: ProductCategory[] = [
  "Groceries",
  "Beverages",
  "Household",
  "Personal care",
  "Snacks",
  "Stationery",
];
const EMPTY_MOVEMENTS: InventoryMovement[] = [];
const EMPTY_ORDERS: SupplierOrderDraft[] = [];
const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

interface ProductFields {
  name: string;
  sku: string;
  category: ProductCategory;
  unit: string;
  price: string;
  costPrice: string;
  stock: string;
  reorderLevel: string;
  supplierName: string;
}

interface StockFormState {
  product: Product;
  operation: StockOperation;
}

function initialProductFields(): ProductFields {
  return {
    name: "",
    sku: "",
    category: "Groceries",
    unit: "unit",
    price: "",
    costPrice: "",
    stock: "0",
    reorderLevel: "5",
    supplierName: "",
  };
}

function productFields(product: Product): ProductFields {
  return {
    name: product.name,
    sku: product.sku,
    category: product.category,
    unit: product.unit,
    price: String(product.price),
    costPrice: String(product.costPrice),
    stock: String(product.stock),
    reorderLevel: String(product.reorderLevel),
    supplierName: product.supplierName ?? "",
  };
}

function inputNumber(value: string, label: string, integer = false): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || (integer && !Number.isInteger(parsed))) {
    throw new Error(`${label} must be a ${integer ? "non-negative whole number" : "non-negative number"}.`);
  }
  return parsed;
}

function stockLabel(product: Product): { label: string; className: string } {
  if (product.stock === 0) return { label: "Out of stock", className: "bg-rose-100 text-rose-700" };
  if (product.stock <= product.reorderLevel) {
    return { label: "Low stock", className: "bg-amber-100 text-amber-800" };
  }
  return { label: "In stock", className: "bg-emerald-100 text-emerald-800" };
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function InventoryDashboard() {
  const {
    data,
    status,
    error: dataError,
    upsertProduct,
    removeProduct,
    adjustStock,
    upsertSupplierOrder,
  } = useDemoStore();
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<ProductCategory | "all">("all");
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [productFieldsState, setProductFieldsState] = useState<ProductFields>(initialProductFields);
  const [stockForm, setStockForm] = useState<StockFormState | null>(null);
  const [stockQuantity, setStockQuantity] = useState("");
  const [stockReason, setStockReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [orderDraft, setOrderDraft] = useState<SupplierOrderDraft | null>(null);

  const movements = data.inventoryMovements ?? EMPTY_MOVEMENTS;
  const orders = data.supplierOrders ?? EMPTY_ORDERS;
  const filteredProducts = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("en-IN");
    return data.products.filter((product) =>
      (!needle ||
        product.name.toLocaleLowerCase("en-IN").includes(needle) ||
        product.sku.toLocaleLowerCase("en-IN").includes(needle)) &&
      (categoryFilter === "all" || product.category === categoryFilter),
    );
  }, [categoryFilter, data.products, query]);
  const metrics = useMemo(
    () => inventoryMetrics(data),
    [data],
  );
  const recommendations = useMemo(
    () => inventoryRecommendations(data.products, data.transactions, new Date(data.asOf))
      .sort((left, right) => {
        const statusOrder = { out: 0, low: 1, normal: 2 };
        return statusOrder[left.status] - statusOrder[right.status] ||
          right.suggestedReorderQuantity - left.suggestedReorderQuantity;
      }),
    [data.asOf, data.products, data.transactions],
  );

  const beginNewProduct = () => {
    setEditingProduct(null);
    setProductFieldsState(initialProductFields());
    setFormError(null);
    setProductFormOpen(true);
  };

  const beginEditProduct = (product: Product) => {
    setEditingProduct(product);
    setProductFieldsState(productFields(product));
    setFormError(null);
    setProductFormOpen(true);
  };

  const saveProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const name = productFieldsState.name.trim();
      const sku = productFieldsState.sku.trim();
      const unit = productFieldsState.unit.trim();
      if (!name) throw new Error("Product name is required.");
      if (!sku) throw new Error("SKU / Product ID is required.");
      if (!unit) throw new Error("Unit is required.");
      if (
        data.products.some(
          (product) =>
            product.id !== editingProduct?.id &&
            product.sku.trim().toLocaleLowerCase("en-IN") === sku.toLocaleLowerCase("en-IN"),
        )
      ) {
        throw new Error("That SKU is already in use. Enter a unique SKU.");
      }

      const product: Product = {
        id: editingProduct?.id ?? crypto.randomUUID(),
        name,
        sku,
        category: productFieldsState.category,
        unit,
        price: inputNumber(productFieldsState.price, "Selling price"),
        costPrice: inputNumber(productFieldsState.costPrice, "Purchase cost"),
        stock: editingProduct
          ? editingProduct.stock
          : inputNumber(productFieldsState.stock, "Stock quantity", true),
        reorderLevel: inputNumber(productFieldsState.reorderLevel, "Minimum stock threshold", true),
        supplierName: productFieldsState.supplierName.trim(),
        lastUpdatedAt: new Date().toISOString(),
      };
      if (busy) return;
      setBusy(true);
      const ok = await upsertProduct(product);
      if (ok) {
        setFormError(null);
        setNotice("Inventory changes saved.");
        setProductFormOpen(false);
      } else {
        setFormError("The product could not be saved. See the error below for details.");
      }
    } catch (validationError) {
      setFormError(
        validationError instanceof Error ? validationError.message : "Product could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  };

  const deleteProduct = async (product: Product) => {
    const hasSalesHistory = data.transactions.some((transaction) =>
      transaction.items.some((item) => item.productId === product.id),
    );
    if (hasSalesHistory) {
      setFormError("This product has transaction history and cannot be deleted without losing sales records.");
      return;
    }
    if (!window.confirm(`Delete ${product.name}? This cannot be undone.`)) return;
    if (busy) return;
    setBusy(true);
    const ok = await removeProduct(product.id);
    setBusy(false);
    if (ok) {
      setNotice(`${product.name} was deleted.`);
    } else {
      setFormError("The product could not be deleted. See the error below for details.");
    }
  };

  const beginStockOperation = (product: Product, operation: StockOperation) => {
    setStockForm({ product, operation });
    setStockQuantity("");
    setStockReason("");
    setFormError(null);
  };

  const saveStockOperation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!stockForm || busy) return;
    try {
      const { product, operation } = stockForm;
      const amount = inputNumber(stockQuantity, operation === "adjustment" ? "New stock quantity" : "Quantity", true);
      const reason = stockReason.trim();
      if (!reason) throw new Error("Please enter a reason or purchase reference.");
      if (operation !== "adjustment" && amount < 1) {
        throw new Error("Stock operation quantity must be at least 1.");
      }
      if (operation === "adjustment" && amount === product.stock) {
        throw new Error("The new quantity must differ from current stock.");
      }
      // Negative-stock rules are enforced by the database based on the
      // business setting; server errors surface below.
      setBusy(true);
      const result = await adjustStock(product.id, operation, amount, reason);
      if (result === null) {
        setFormError("The stock operation could not be saved. See the error below for details.");
        return;
      }
      setStockForm(null);
      setNotice(`${product.name} stock updated to ${result.newStock} ${product.unit}.`);
    } catch (validationError) {
      setFormError(
        validationError instanceof Error ? validationError.message : "Stock operation failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const createOrderDraft = () => {
    const items: SupplierOrderItem[] = metrics.lowStock.map((product) => ({
      productId: product.productId,
      productName: product.productName,
      currentStock: product.stock,
      reorderQuantity: Math.max(1, product.suggestedReorderQuantity),
      purchaseCost: product.purchaseCost,
      estimatedAmount: Math.max(1, product.suggestedReorderQuantity) * product.purchaseCost,
    }));
    if (items.length === 0) {
      setNotice("No products need replenishment right now.");
      return;
    }
    const supplierNames = [...new Set(metrics.lowStock.map((product) => product.supplierName).filter(Boolean))];
    setOrderDraft({
      id: crypto.randomUUID(),
      supplierName: supplierNames.length === 1 ? supplierNames[0]! : "",
      status: "draft",
      createdAt: new Date().toISOString(),
      items,
    });
    setFormError(null);
  };

  const updateOrderItem = (productId: string, quantity: number) => {
    if (!orderDraft) return;
    setOrderDraft({
      ...orderDraft,
      items: orderDraft.items.map((item) =>
        item.productId === productId
          ? {
              ...item,
              reorderQuantity: Math.max(1, Math.floor(quantity)),
              estimatedAmount: Math.max(1, Math.floor(quantity)) * item.purchaseCost,
            }
          : item,
      ),
    });
  };

  const saveOrderDraft = async () => {
    if (!orderDraft || busy) return;
    if (!orderDraft.supplierName.trim()) {
      setFormError("Supplier name is required before saving this order draft.");
      return;
    }
    if (orderDraft.items.length === 0) {
      setFormError("Add at least one product to the supplier order.");
      return;
    }
    if (!orderDraft.items.every((item) => Number.isInteger(item.reorderQuantity) && item.reorderQuantity > 0)) {
      setFormError("Every product needs a positive whole-number reorder quantity.");
      return;
    }
    setBusy(true);
    const ok = await upsertSupplierOrder(orderDraft);
    setBusy(false);
    if (!ok) {
      setFormError("The supplier order could not be saved. See the error below for details.");
      return;
    }
    setFormError(null);
    setOrderDraft(null);
    setNotice("Supplier order draft saved. No order was sent.");
  };

  const approveOrder = async (order: SupplierOrderDraft) => {
    if (busy) return;
    if (!window.confirm("Approve this supplier order draft? It will be recorded in your store only; no order will be sent.")) {
      return;
    }
    const approved: SupplierOrderDraft = {
      ...order,
      status: "approved",
      approvedAt: new Date().toISOString(),
    };
    setBusy(true);
    const ok = await upsertSupplierOrder(approved);
    setBusy(false);
    if (ok) {
      setNotice("Supplier order marked approved in DukaanOS. It was not sent to the supplier.");
    }
  };

  if (status === "loading") {
    return <p className="mx-auto max-w-6xl px-4 py-10 text-sm text-slate-500" role="status">Loading inventory…</p>;
  }
  if (status === "error") {
    return <p className="mx-auto max-w-3xl rounded-xl border border-rose-200 bg-white p-5 text-sm text-rose-700" role="alert">{dataError}</p>;
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-9">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-lime-700">DukaanOS workspace</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Inventory</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">Manage product details, stock movements, and supplier restocking from your current store data.</p>
        </div>
        <button type="button" onClick={beginNewProduct} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-700">
          <Plus size={16} aria-hidden="true" /> Add product
        </button>
      </header>

      {(notice || formError || dataError) && (
        <div className="space-y-2">
          {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}
          {formError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{formError}</p>}
          {dataError && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{dataError}</p>}
        </div>
      )}

      <section aria-label="Inventory summary" className="grid gap-3 sm:grid-cols-3">
        {[
          ["Products", data.products.length],
          ["Total units", metrics.totalUnits],
          ["Low stock / out", metrics.lowStock.length],
        ].map(([label, value]) => (
          <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">Products</h2>
            <p className="mt-1 text-xs text-slate-500">{filteredProducts.length} of {data.products.length} products</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative">
              <span className="sr-only">Search products</span>
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or SKU" className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm sm:w-56" />
            </label>
            <label>
              <span className="sr-only">Filter by category</span>
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as ProductCategory | "all")} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm sm:w-48">
                <option value="all">All categories</option>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
          </div>
        </div>

        {productFormOpen && (
          <form onSubmit={saveProduct} className="space-y-4 border-b border-lime-200 bg-lime-50/60 p-5" aria-label={editingProduct ? "Edit product" : "Add product"}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">{editingProduct ? `Edit ${editingProduct.name}` : "Add a product"}</h3>
              <button type="button" aria-label="Close product form" onClick={() => setProductFormOpen(false)} className="rounded-md p-1 text-slate-500 hover:bg-white"><X size={18} /></button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-xs font-medium text-slate-600">Product name *
                <input required value={productFieldsState.name} onChange={(event) => setProductFieldsState({ ...productFieldsState, name: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm" />
              </label>
              <label className="text-xs font-medium text-slate-600">SKU / Product ID *
                <input required value={productFieldsState.sku} onChange={(event) => setProductFieldsState({ ...productFieldsState, sku: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm" />
              </label>
              <label className="text-xs font-medium text-slate-600">Category *
                <select value={productFieldsState.category} onChange={(event) => setProductFieldsState({ ...productFieldsState, category: event.target.value as ProductCategory })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
                  {categories.map((category) => <option key={category}>{category}</option>)}
                </select>
              </label>
              <label className="text-xs font-medium text-slate-600">Selling price (₹) *
                <input required type="number" min="0" step="0.01" value={productFieldsState.price} onChange={(event) => setProductFieldsState({ ...productFieldsState, price: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm" />
              </label>
              <label className="text-xs font-medium text-slate-600">Purchase cost (₹) *
                <input required type="number" min="0" step="0.01" value={productFieldsState.costPrice} onChange={(event) => setProductFieldsState({ ...productFieldsState, costPrice: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm" />
              </label>
              {!editingProduct && <label className="text-xs font-medium text-slate-600">Opening stock *
                <input required type="number" min="0" step="1" value={productFieldsState.stock} onChange={(event) => setProductFieldsState({ ...productFieldsState, stock: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm" />
              </label>}
              <label className="text-xs font-medium text-slate-600">Minimum stock threshold *
                <input required type="number" min="0" step="1" value={productFieldsState.reorderLevel} onChange={(event) => setProductFieldsState({ ...productFieldsState, reorderLevel: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm" />
              </label>
              <label className="text-xs font-medium text-slate-600">Unit *
                <input required value={productFieldsState.unit} onChange={(event) => setProductFieldsState({ ...productFieldsState, unit: event.target.value })} placeholder="e.g. 1 kg, bottle" className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm" />
              </label>
              <label className="text-xs font-medium text-slate-600">Supplier name
                <input value={productFieldsState.supplierName} onChange={(event) => setProductFieldsState({ ...productFieldsState, supplierName: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm" />
              </label>
            </div>
            {editingProduct && <p className="text-xs text-slate-500">Current stock: {editingProduct.stock} {editingProduct.unit}. Use Stock In, Stock Out, or Adjust to record stock changes.</p>}
            <div className="flex gap-2">
              <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-700"><Check size={15} /> Save product</button>
              <button type="button" onClick={() => setProductFormOpen(false)} className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-700">Cancel</button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Price / cost</th><th className="px-4 py-3">Stock</th><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Updated</th><th className="px-4 py-3">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.map((product) => {
                const badge = stockLabel(product);
                return (
                  <tr key={product.id}>
                    <td className="px-4 py-4"><p className="font-medium text-slate-900">{product.name}</p><p className="mt-0.5 text-xs text-slate-500">{product.sku} · {product.unit}</p></td>
                    <td className="px-4 py-4 text-slate-600">{product.category}</td>
                    <td className="px-4 py-4"><p className="text-slate-900">{currency.format(product.price)}</p><p className="text-xs text-slate-500">Cost {currency.format(product.costPrice)}</p></td>
                    <td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badge.className}`}>{badge.label}</span><p className="mt-1 text-xs text-slate-600">{product.stock} {product.unit} · min {product.reorderLevel}</p></td>
                    <td className="px-4 py-4 text-slate-600">{product.supplierName?.trim() || "Not set"}</td>
                    <td className="px-4 py-4 text-xs text-slate-500">{product.lastUpdatedAt ? formatDate(product.lastUpdatedAt) : "—"}</td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        <button type="button" onClick={() => beginStockOperation(product, "stock-in")} aria-label={`Stock In ${product.name}`} className="rounded-md border border-slate-200 p-2 text-emerald-700 hover:bg-emerald-50"><ArrowDownToLine size={15} /></button>
                        <button type="button" onClick={() => beginStockOperation(product, "stock-out")} aria-label={`Stock Out ${product.name}`} className="rounded-md border border-slate-200 p-2 text-amber-700 hover:bg-amber-50"><ArrowUpFromLine size={15} /></button>
                        <button type="button" onClick={() => beginStockOperation(product, "adjustment")} aria-label={`Adjust ${product.name}`} className="rounded-md border border-slate-200 px-2 text-xs text-slate-700 hover:bg-slate-50">Adjust</button>
                        <button type="button" onClick={() => beginEditProduct(product)} aria-label={`Edit ${product.name}`} className="rounded-md border border-slate-200 p-2 text-slate-700 hover:bg-slate-50"><Pencil size={15} /></button>
                        <button type="button" onClick={() => deleteProduct(product)} aria-label={`Delete ${product.name}`} className="rounded-md border border-slate-200 p-2 text-rose-700 hover:bg-rose-50"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredProducts.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">{data.products.length ? "No products match your search." : "No products yet. Add your first product to start tracking stock."}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {stockForm && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="Stock operation form">
          <div className="flex items-start justify-between gap-3">
            <div><h2 className="font-semibold text-slate-900">{stockForm.operation === "stock-in" ? "Stock In" : stockForm.operation === "stock-out" ? "Stock Out" : "Stock Adjustment"} · {stockForm.product.name}</h2><p className="mt-1 text-sm text-slate-500">Current quantity: {stockForm.product.stock} {stockForm.product.unit}</p></div>
            <button type="button" aria-label="Close stock form" onClick={() => setStockForm(null)} className="rounded-md p-1 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
          </div>
          <form onSubmit={saveStockOperation} className="mt-4 grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
            <label className="text-xs font-medium text-slate-600">{stockForm.operation === "adjustment" ? "Correct quantity to *" : "Quantity *"}
              <input autoFocus required type="number" min="0" step="1" value={stockQuantity} onChange={(event) => setStockQuantity(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" />
            </label>
            <label className="text-xs font-medium text-slate-600">Reason / purchase reference *
              <input required value={stockReason} onChange={(event) => setStockReason(event.target.value)} placeholder="e.g. Supplier invoice #123 or damaged goods" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" />
            </label>
            <button type="submit" className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-700">Record movement</button>
          </form>
        </section>
      )}

      <section className="grid gap-5 lg:grid-cols-2">
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 p-5"><div><h2 className="font-semibold text-slate-900">Low stock alerts</h2><p className="mt-1 text-xs text-slate-500">Triggered when stock is at or below minimum.</p></div><AlertTriangle size={18} className="text-amber-600" /></div>
          {metrics.lowStock.length === 0 ? <p className="px-5 py-8 text-center text-sm text-slate-500">All products are above their minimum stock levels.</p> : (
            <div className="divide-y divide-slate-100">
              {metrics.lowStock.map((product) => <div key={product.productId} className="flex items-start justify-between gap-4 px-5 py-4"><div><p className="font-medium text-slate-900">{product.productName}</p><p className="mt-1 text-xs text-slate-500">Current {product.stock} · minimum {product.minimumStock} · shortage {product.shortage}</p></div><span className="shrink-0 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800">Reorder {product.suggestedReorderQuantity}</span></div>)}
            </div>
          )}
          <div className="border-t border-slate-100 p-4"><button type="button" onClick={createOrderDraft} disabled={metrics.lowStock.length === 0} className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"><ClipboardList size={15} /> Create supplier order draft</button></div>
        </article>

        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 p-5"><Package size={18} className="text-slate-500" /><div><h2 className="font-semibold text-slate-900">Inventory recommendations</h2><p className="mt-1 text-xs text-slate-500">Rule-based reorder quantities use the last 30 days of completed sales and a 14-day coverage target.</p></div></div>
          <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
            {recommendations.length === 0 ? <p className="px-5 py-8 text-center text-sm text-slate-500">Add products to see inventory recommendations.</p> : recommendations.map((item) => <div key={item.productId} className="px-5 py-3"><div className="flex justify-between gap-3"><p className="text-sm font-medium text-slate-900">{item.productName}</p><span className={`text-xs font-medium ${item.status === "normal" ? "text-emerald-700" : "text-amber-800"}`}>{item.status === "normal" ? "Sufficient" : `Reorder ${item.suggestedReorderQuantity}`}</span></div><p className="mt-1 text-xs text-slate-500">Stock {item.stock} · minimum {item.minimumStock} · sold {item.quantitySoldInWindow} in last 30 days</p></div>)}
          </div>
        </article>
      </section>

      {orderDraft && (
        <section className="space-y-4 rounded-2xl border border-lime-300 bg-white p-5 shadow-sm" aria-label="Supplier order draft">
          <div className="flex items-start justify-between"><div><h2 className="font-semibold text-slate-900">Review supplier order draft</h2><p className="mt-1 text-xs text-slate-500">Review details and quantities. Saving or approving does not send an order.</p></div><button type="button" aria-label="Close supplier order draft" onClick={() => setOrderDraft(null)} className="rounded-md p-1 text-slate-500 hover:bg-slate-100"><X size={18} /></button></div>
          <label className="block max-w-md text-xs font-medium text-slate-600">Supplier name *
            <input required value={orderDraft.supplierName} onChange={(event) => setOrderDraft({ ...orderDraft, supplierName: event.target.value })} placeholder="Enter supplier name" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {orderDraft.items.map((item) => <div key={item.productId} className="grid gap-3 p-4 sm:grid-cols-[1fr_130px_120px_auto] sm:items-center"><div><p className="font-medium text-slate-900">{item.productName}</p><p className="text-xs text-slate-500">Current {item.currentStock} · cost {currency.format(item.purchaseCost)} each</p></div><label className="text-xs text-slate-600">Reorder quantity<input type="number" min="1" step="1" value={item.reorderQuantity} onChange={(event) => updateOrderItem(item.productId, Math.max(1, Number(event.target.value) || 1))} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm" /></label><p className="text-sm font-medium text-slate-800">{currency.format(item.reorderQuantity * item.purchaseCost)}</p><button type="button" aria-label={`Remove ${item.productName} from draft`} onClick={() => setOrderDraft({ ...orderDraft, items: orderDraft.items.filter((entry) => entry.productId !== item.productId) })} className="rounded-md p-2 text-rose-700 hover:bg-rose-50"><Trash2 size={15} /></button></div>)}
            {orderDraft.items.length === 0 && <p className="p-5 text-sm text-slate-500">No products in this draft. Close it and create another from low-stock alerts.</p>}
          </div>
          <p className="text-right text-sm font-semibold text-slate-900">Estimated order amount: {currency.format(orderDraft.items.reduce((sum, item) => sum + item.reorderQuantity * item.purchaseCost, 0))}</p>
          <button type="button" onClick={saveOrderDraft} disabled={orderDraft.items.length === 0} className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">Save draft</button>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5"><h2 className="font-semibold text-slate-900">Supplier orders</h2><p className="mt-1 text-xs text-slate-500">Drafts and approvals are recorded here. No supplier messages are sent.</p></div>
        {orders.length === 0 ? <p className="px-5 py-8 text-center text-sm text-slate-500">No supplier order drafts saved.</p> : <div className="divide-y divide-slate-100">
          {orders.map((order) => <article key={order.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><h3 className="font-medium text-slate-900">{order.supplierName}</h3><span className={`rounded-full px-2 py-0.5 text-xs ${order.status === "approved" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{order.status}</span></div><p className="mt-1 text-xs text-slate-500">{order.items.length} products · {formatDate(order.createdAt)}</p><p className="mt-1 text-sm text-slate-700">Estimated total {currency.format(order.items.reduce((sum, item) => sum + item.reorderQuantity * item.purchaseCost, 0))}</p></div>{order.status === "draft" && <button type="button" onClick={() => approveOrder(order)} className="inline-flex h-9 items-center justify-center gap-2 self-start rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"><Check size={14} /> Mark approved</button>}</article>)}
        </div>}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5"><h2 className="font-semibold text-slate-900">Stock movement history</h2><p className="mt-1 text-xs text-slate-500">Latest stock-in, stock-out, and adjustment records.</p></div>
        {movements.length === 0 ? <p className="px-5 py-8 text-center text-sm text-slate-500">Stock operations will appear here after you record a movement.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Product</th><th className="px-4 py-3">Operation</th><th className="px-4 py-3">Change</th><th className="px-4 py-3">Previous → new</th><th className="px-4 py-3">Reason</th></tr></thead><tbody className="divide-y divide-slate-100">{movements.slice().sort((left, right) => right.createdAt.localeCompare(left.createdAt)).map((movement) => <tr key={movement.id}><td className="px-4 py-3 text-xs text-slate-500">{formatDate(movement.createdAt)}</td><td className="px-4 py-3 font-medium text-slate-900">{movement.productName}</td><td className="px-4 py-3 capitalize text-slate-600">{movement.operation.replace("-", " ")}</td><td className="px-4 py-3 text-slate-700">{movement.quantityChanged > 0 ? "+" : ""}{movement.quantityChanged}</td><td className="px-4 py-3 text-slate-600">{movement.previousStock} → {movement.newStock}</td><td className="px-4 py-3 text-slate-600">{movement.reason}</td></tr>)}</tbody></table></div>}
      </section>
    </div>
  );
}
