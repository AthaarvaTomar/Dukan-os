"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BadgeIndianRupee,
  Package,
  ShoppingBag,
  UsersRound,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDemoStore } from "@/components/dashboard/use-demo-store";
import {
  averageOrderValue,
  bestSellingProducts,
  dashboardTrend,
  estimatedProfit,
  inventoryStatus,
  inventorySummary,
  segmentCustomers,
  totalExpenses,
  totalRevenue,
  totalTransactions,
} from "@/lib/demo-data/analytics";
import type { DashboardPeriod, DashboardTrendPoint } from "@/lib/demo-data/types";
import {
  SalesOverviewChart,
  type DashboardMetric,
} from "@/components/dashboard/sales-overview-chart";

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const numberFormatter = new Intl.NumberFormat("en-IN");
const periodOptions: Record<
  DashboardPeriod,
  { chartBuckets: number; comparisonBuckets: number; label: string }
> = {
  daily: { chartBuckets: 14, comparisonBuckets: 7, label: "Last 7 days" },
  weekly: { chartBuckets: 8, comparisonBuckets: 4, label: "Last 4 weeks" },
  monthly: { chartBuckets: 6, comparisonBuckets: 3, label: "Last 3 months" },
};

const metricCards: {
  key: DashboardMetric | "customers";
  label: string;
  icon: typeof BadgeIndianRupee;
}[] = [
  { key: "revenue", label: "Total revenue", icon: BadgeIndianRupee },
  { key: "transactions", label: "Total transactions", icon: ShoppingBag },
  { key: "estimatedProfit", label: "Estimated profit", icon: Wallet },
  { key: "customers", label: "Total customers", icon: UsersRound },
];

type DashboardModel = {
  trend: DashboardTrendPoint[];
  currentTransactions: ReturnType<typeof useDemoStore>["data"]["transactions"];
  previousTransactions: ReturnType<typeof useDemoStore>["data"]["transactions"];
  currentExpenses: ReturnType<typeof useDemoStore>["data"]["expenses"];
  currentNewCustomers: number;
  previousNewCustomers: number;
  bestSellers: ReturnType<typeof bestSellingProducts>;
  segments: ReturnType<typeof segmentCustomers>;
  stock: ReturnType<typeof inventorySummary>;
  lowStockProducts: ReturnType<typeof useDemoStore>["data"]["products"];
};

type DashboardModelResult =
  | { model: DashboardModel; error: null }
  | { model: null; error: string };

function percentageChange(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? "No change" : "New activity";
  const percentage = ((current - previous) / previous) * 100;
  const rounded = Math.round(Math.abs(percentage));
  return `${percentage >= 0 ? "+" : "−"}${rounded}% vs previous period`;
}

function dateLabel(date: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date.slice(0, 10)}T12:00:00.000Z`));
}

function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-[1440px] animate-pulse space-y-7" aria-label="Loading overview" role="status">
      <span className="sr-only">Loading business overview…</span>
      <div className="space-y-3">
        <div className="h-4 w-36 rounded bg-slate-200" />
        <div className="h-8 w-64 rounded bg-slate-200" />
        <div className="h-4 w-80 max-w-full rounded bg-slate-200" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((card) => <div key={card.key} className="h-36 rounded-2xl bg-white shadow-sm" />)}
      </div>
      <div className="h-[360px] rounded-2xl bg-white shadow-sm" />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="h-72 rounded-2xl bg-white shadow-sm" />
        <div className="h-72 rounded-2xl bg-white shadow-sm" />
      </div>
    </div>
  );
}

export function OverviewLoading() {
  return <DashboardLoading />;
}

export function OverviewDashboard() {
  const { data, reset, status, error } = useDemoStore();
  const [period, setPeriod] = useState<DashboardPeriod>("daily");
  const [selectedMetric, setSelectedMetric] = useState<DashboardMetric>("revenue");
  const asOf = useMemo(() => new Date(data.asOf), [data.asOf]);
  const todayLabel = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(asOf);

  const modelResult = useMemo((): DashboardModelResult => {
    try {
      const { chartBuckets, comparisonBuckets } = periodOptions[period];
      const trend = dashboardTrend(data, period, chartBuckets, asOf);
      const currentStart = trend[trend.length - comparisonBuckets]?.date;
      const previousStart = trend[trend.length - comparisonBuckets * 2]?.date;
      const currentTransactions = data.transactions.filter((transaction) => {
        const date = transaction.date.slice(0, 10);
        return currentStart !== undefined && date >= currentStart && new Date(transaction.date) <= asOf;
      });
      const previousTransactions = data.transactions.filter((transaction) => {
        const date = transaction.date.slice(0, 10);
        return previousStart !== undefined && currentStart !== undefined &&
          date >= previousStart && date < currentStart;
      });
      const currentExpenses = data.expenses.filter(
        (expense) =>
          currentStart !== undefined &&
          expense.date.slice(0, 10) >= currentStart &&
          new Date(expense.date) <= asOf,
      );
      const currentNewCustomers = trend
        .slice(-comparisonBuckets)
        .reduce((sum, point) => sum + point.newCustomers, 0);
      const previousNewCustomers = trend
        .slice(-comparisonBuckets * 2, -comparisonBuckets)
        .reduce((sum, point) => sum + point.newCustomers, 0);
      const bestSellers = bestSellingProducts(data.products, currentTransactions, 5);
      const stock = inventorySummary(data.products);
      const lowStockProducts = data.products.filter((product) => inventoryStatus(product) !== "normal");

      return {
        model: {
          trend,
          currentTransactions,
          previousTransactions,
          currentExpenses,
          currentNewCustomers,
          previousNewCustomers,
          bestSellers,
          segments: segmentCustomers(data.customers, data.transactions, asOf),
          stock,
          lowStockProducts,
        },
        error: null,
      };
    } catch (error) {
      return {
        model: null,
        error: error instanceof Error
          ? error.message
          : "The dashboard could not read the current business data.",
      };
    }
  }, [asOf, data, period]);

  if (status === "loading") return <DashboardLoading />;

  if (status === "error") {
    return (
      <section role="alert" className="mx-auto max-w-2xl rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">We couldn&apos;t load your store data</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {error ?? "The store data service is temporarily unavailable."}
        </p>
        <Button className="mt-5" onClick={() => void reset()}>Retry loading data</Button>
      </section>
    );
  }

  const model = modelResult.model;
  if (!model) {
    return (
      <section role="alert" className="mx-auto max-w-2xl rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">We couldn&apos;t load your overview</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {modelResult.error}
        </p>
        <Button className="mt-5" onClick={reset}>Restore demo data</Button>
      </section>
    );
  }

  const currentRevenue = totalRevenue(model.currentTransactions);
  const previousRevenue = totalRevenue(model.previousTransactions);
  const currentTransactions = totalTransactions(model.currentTransactions);
  const previousTransactions = totalTransactions(model.previousTransactions);
  const currentProfit = estimatedProfit({
    transactions: model.currentTransactions,
    expenses: model.currentExpenses,
  });
  const previousProfit = estimatedProfit({
    transactions: model.previousTransactions,
    expenses: data.expenses.filter((expense) => {
      const start = model.trend[model.trend.length - periodOptions[period].comparisonBuckets * 2]?.date;
      const end = model.trend[model.trend.length - periodOptions[period].comparisonBuckets]?.date;
      return start !== undefined && end !== undefined &&
        expense.date.slice(0, 10) >= start && expense.date.slice(0, 10) < end;
    }),
  });
  const currentAverageOrder = averageOrderValue(model.currentTransactions);
  const customerCount = data.customers.length;
  const activeSegments = model.segments.filter(
    (customer) => customer.segment === "regular" || customer.segment === "high-value",
  ).length;
  const customerRetention = customerCount === 0 ? 0 : (activeSegments / customerCount) * 100;
  const latestTransactions = [...data.transactions]
    .filter((transaction) => new Date(transaction.date) <= asOf)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
  const expensesInRange = totalExpenses(model.currentExpenses);
  const registrationChange = model.currentNewCustomers - model.previousNewCustomers;

  const cardValues: Record<string, { value: string; caption: string; change: string }> = {
    revenue: {
      value: currencyFormatter.format(currentRevenue),
      caption: periodOptions[period].label,
      change: percentageChange(currentRevenue, previousRevenue),
    },
    transactions: {
      value: numberFormatter.format(currentTransactions),
      caption: periodOptions[period].label,
      change: percentageChange(currentTransactions, previousTransactions),
    },
    estimatedProfit: {
      value: currencyFormatter.format(currentProfit),
      caption: `${currencyFormatter.format(expensesInRange)} expenses in period`,
      change: percentageChange(currentProfit, previousProfit),
    },
    customers: {
      value: numberFormatter.format(customerCount),
      caption: `${numberFormatter.format(model.currentNewCustomers)} new in ${periodOptions[period].label.toLowerCase()}`,
      change: `${numberFormatter.format(activeSegments)} regular or high-value`,
    },
  };

  const salesInsight =
    currentRevenue > previousRevenue
      ? `Revenue is ${percentageChange(currentRevenue, previousRevenue).replace(" vs previous period", "")} compared with the previous period.`
      : currentRevenue < previousRevenue
        ? `Revenue is ${percentageChange(currentRevenue, previousRevenue).replace(" vs previous period", "")} compared with the previous period.`
        : "Revenue is unchanged from the previous period.";

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-7">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-sm font-medium text-slate-500">{todayLabel}</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-[30px]">
            Sharma General Store
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Your business at a glance, powered by your store data.
          </p>
        </div>
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 shadow-sm">
          {periodOptions[period].label}
        </p>
      </section>

      <section aria-label="Store performance" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((card) => {
          const Icon = card.icon;
          const selected =
            card.key === "customers"
              ? selectedMetric === "newCustomers"
              : card.key === selectedMetric;
          const details = cardValues[card.key];
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => {
                if (card.key !== "customers") setSelectedMetric(card.key);
                else setSelectedMetric("newCustomers");
              }}
              aria-pressed={selected}
              className={`rounded-2xl border bg-white p-5 text-left shadow-[0_2px_8px_rgba(15,23,42,0.025)] transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${selected ? "border-emerald-300 ring-1 ring-emerald-200" : "border-slate-200/80"}`}
            >
              <div className="flex items-start justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-600">
                  <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
                </span>
                <span className="text-xs font-medium text-slate-400">View trend ↗</span>
              </div>
              <p className="mt-4 text-sm text-slate-500">{card.label}</p>
              <p className="mt-1 text-[26px] font-semibold tracking-tight text-slate-900">{details.value}</p>
              <p className="mt-1 text-xs text-slate-500">{details.caption}</p>
              <p className="mt-2 text-xs font-medium text-emerald-700">{details.change}</p>
            </button>
          );
        })}
      </section>

      <SalesOverviewChart
        data={model.trend}
        period={period}
        metric={selectedMetric}
        onPeriodChange={setPeriod}
      />

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.7fr)]">
        <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_8px_rgba(15,23,42,0.025)] sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900">Sales overview</h2>
              <p className="mt-1 text-sm text-slate-500">
                {periodOptions[period].label} compared with the previous period.
              </p>
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
              {percentageChange(currentRevenue, previousRevenue)}
            </span>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "Revenue", value: currencyFormatter.format(currentRevenue) },
              { label: "Transactions", value: numberFormatter.format(currentTransactions) },
              { label: "Average order", value: currencyFormatter.format(currentAverageOrder) },
              { label: "Profit", value: currencyFormatter.format(currentProfit) },
            ].map((item) => (
              <div key={item.label} className="rounded-xl bg-slate-50 p-3.5">
                <p className="text-xs text-slate-500">{item.label}</p>
                <p className="mt-1.5 truncate text-base font-semibold text-slate-900">{item.value}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_8px_rgba(15,23,42,0.025)] sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900">Customer growth</h2>
              <p className="mt-1 text-sm text-slate-500">New customer registrations</p>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
              <UsersRound size={18} aria-hidden="true" />
            </span>
          </div>
          <div className="mt-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-3xl font-semibold tracking-tight text-slate-900">
                {numberFormatter.format(model.currentNewCustomers)}
              </p>
              <p className="mt-1 text-xs text-slate-500">{periodOptions[period].label}</p>
            </div>
            <div className={`flex items-center gap-1 text-sm font-medium ${registrationChange >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
              {registrationChange >= 0
                ? <ArrowUpRight size={16} aria-hidden="true" />
                : <ArrowDownRight size={16} aria-hidden="true" />}
              {registrationChange >= 0 ? "+" : ""}
              {numberFormatter.format(registrationChange)} vs previous
            </div>
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-violet-500 transition-all"
              style={{
                width: `${customerCount === 0 ? 0 : Math.min(100, (model.currentNewCustomers / customerCount) * 100)}%`,
              }}
            />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            {numberFormatter.format(customerCount)} customers in your store directory
          </p>
        </article>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <article className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.025)]">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-5 sm:px-6">
            <div>
              <h2 className="font-semibold text-slate-900">Recent transactions</h2>
              <p className="mt-1 text-sm text-slate-500">Latest recorded customer orders.</p>
            </div>
            <ShoppingBag size={18} className="text-slate-400" aria-hidden="true" />
          </div>
          {latestTransactions.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-medium text-slate-700">No transactions yet</p>
              <p className="mt-1 text-xs text-slate-500">New customer purchases will appear here.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {latestTransactions.map((transaction, index) => {
                const customer = data.customers.find((entry) => entry.id === transaction.customerId);
                const initials = customer?.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("") ?? "—";
                return (
                  <div key={transaction.id} className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${["bg-rose-100 text-rose-700", "bg-sky-100 text-sky-700", "bg-violet-100 text-violet-700", "bg-amber-100 text-amber-700", "bg-emerald-100 text-emerald-700"][index]}`}>
                      {initials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{customer?.name ?? "Unknown customer"}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {transaction.items.map((item) => item.productName).join(", ")} · {dateLabel(transaction.date)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-slate-800">{currencyFormatter.format(transaction.totalAmount)}</p>
                      <p className={`mt-0.5 text-[11px] ${transaction.status === "completed" ? "text-emerald-700" : "text-amber-700"}`}>
                        {transaction.status === "completed" ? "Completed" : "Processing"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </article>

        <article className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.025)]">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-5 sm:px-6">
            <div>
              <h2 className="font-semibold text-slate-900">Best-selling products</h2>
              <p className="mt-1 text-sm text-slate-500">{periodOptions[period].label} by units sold.</p>
            </div>
            <Package size={18} className="text-slate-400" aria-hidden="true" />
          </div>
          {model.bestSellers.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-medium text-slate-700">No product sales in this period</p>
              <p className="mt-1 text-xs text-slate-500">Products will rank here after a sale is recorded.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {model.bestSellers.map((product, index) => (
                <div key={product.productId} className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-xs font-semibold text-slate-500">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{product.productName}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{numberFormatter.format(product.quantitySold)} units sold</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-slate-800">
                    {currencyFormatter.format(product.revenue)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.025)]">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-5 sm:px-6">
          <div>
            <h2 className="font-semibold text-slate-900">Low-stock alerts</h2>
            <p className="mt-1 text-sm text-slate-500">
              {numberFormatter.format(model.stock.low)} low · {numberFormatter.format(model.stock.out)} out of stock
            </p>
          </div>
          <Package size={18} className="text-slate-400" aria-hidden="true" />
        </div>
        {model.lowStockProducts.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm font-medium text-slate-700">All products are above their reorder levels</p>
            <p className="mt-1 text-xs text-slate-500">Stock health is calculated from each product&apos;s reorder level.</p>
          </div>
        ) : (
          <div className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:divide-y-0 sm:divide-x">
            {model.lowStockProducts.map((product) => {
              const outOfStock = product.stock <= 0;
              return (
                <div key={product.id} className="flex items-center gap-3 px-5 py-4 sm:px-6">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${outOfStock ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>
                    <Package size={17} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{product.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {product.stock} {product.unit} in stock · reorder at {product.reorderLevel}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${outOfStock ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>
                    {outOfStock ? "Out of stock" : "Low stock"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <div className="mb-4">
          <h2 className="font-semibold text-slate-900">Business insights</h2>
          <p className="mt-1 text-sm text-slate-500">Quick signals from your sales, customers, and inventory.</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <article className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-800">
              <BadgeIndianRupee size={17} aria-hidden="true" />
              Sales pulse
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-700">{salesInsight}</p>
            <p className="mt-2 text-xs text-slate-500">
              {currencyFormatter.format(currentRevenue)} recorded in {periodOptions[period].label.toLowerCase()}.
            </p>
          </article>
          <article className="rounded-2xl border border-violet-100 bg-violet-50/60 p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-violet-800">
              <UsersRound size={17} aria-hidden="true" />
              Customer momentum
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-700">
              {model.currentNewCustomers > 0
                ? `${numberFormatter.format(model.currentNewCustomers)} new customers joined in this period.`
                : "No new customers joined in this period."}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {numberFormatter.format(model.segments.filter((customer) => customer.segment === "high-value").length)} high-value customers · {Math.round(customerRetention)}% regular or high-value
            </p>
          </article>
          <article className="rounded-2xl border border-amber-100 bg-amber-50/60 p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
              <Package size={17} aria-hidden="true" />
              Stock to watch
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-700">
              {model.stock.low + model.stock.out > 0
                ? `${numberFormatter.format(model.stock.low + model.stock.out)} products need a stock check.`
                : "No products are currently below their reorder levels."}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {numberFormatter.format(model.stock.low)} low · {numberFormatter.format(model.stock.out)} out · {numberFormatter.format(model.stock.normal)} healthy
            </p>
          </article>
        </div>
      </section>

      <section className="rounded-2xl bg-slate-900 p-5 text-white sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-6">
        <div>
          <p className="text-sm font-semibold">Your store data, one clear picture.</p>
          <p className="mt-1 text-sm text-slate-400">
            Every dashboard figure is calculated from the current demo transactions and inventory.
          </p>
        </div>
        <div className="mt-4 flex items-center gap-2 text-sm font-medium text-lime-300 sm:mt-0">
          {numberFormatter.format(data.transactions.length)} total transactions
          <ArrowRight size={16} aria-hidden="true" />
        </div>
      </section>
    </div>
  );
}
