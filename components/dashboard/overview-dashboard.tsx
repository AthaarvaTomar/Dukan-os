"use client";

import { useMemo } from "react";
import {
  BadgeIndianRupee,
  ShoppingBag,
  UsersRound,
  Wallet,
} from "lucide-react";
import {
  averageOrderValue,
  bestSellingProducts,
  dailyRevenue,
  estimatedProfit,
  inventorySummary,
  segmentCustomers,
  totalExpenses,
  totalRevenue,
  totalTransactions,
} from "@/lib/demo-data/analytics";
import { useDemoStore } from "@/components/dashboard/use-demo-store";
import { SalesOverviewChart } from "@/components/dashboard/sales-overview-chart";

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const numberFormatter = new Intl.NumberFormat("en-IN");

const metricIcons = [BadgeIndianRupee, ShoppingBag, Wallet, UsersRound] as const;

export function OverviewDashboard() {
  const { data } = useDemoStore();
  const metrics = [
    { label: "Total revenue", value: currencyFormatter.format(totalRevenue(data.transactions)) },
    { label: "Transactions", value: numberFormatter.format(totalTransactions(data.transactions)) },
    { label: "Average order value", value: currencyFormatter.format(averageOrderValue(data.transactions)) },
    { label: "Estimated profit", value: currencyFormatter.format(estimatedProfit(data)) },
  ];
  const recentOrders = data.transactions.slice(0, 4).map((transaction) => {
    const customer = data.customers.find((entry) => entry.id === transaction.customerId);
    return {
      id: transaction.id,
      initials: customer?.name.split(" ").map((part) => part[0]).slice(0, 2).join("") ?? "—",
      name: customer?.name ?? "Unknown customer",
      item: transaction.items.map((item) => item.productName).join(", "),
      amount: currencyFormatter.format(transaction.totalAmount),
      status: transaction.status,
    };
  });
  const segments = useMemo(
    () => segmentCustomers(data.customers, data.transactions, new Date(data.asOf)),
    [data.asOf, data.customers, data.transactions],
  );
  const bestSeller = bestSellingProducts(data.products, data.transactions, 1)[0];
  const stockSummary = inventorySummary(data.products);
  const expenses = totalExpenses(data.expenses);
  const asOf = new Date(data.asOf);
  const chartData = dailyRevenue(data.transactions, 30, asOf);
  const dateLabel = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(asOf);
  const segmentCount = (segment: string) =>
    numberFormatter.format(segments.filter((customer) => customer.segment === segment).length);

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-7">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-sm font-medium text-slate-500">{dateLabel}</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-[30px]">
            Sharma General Store
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            A quick look at your store&apos;s last 90 days.
          </p>
        </div>
        <div className="inline-flex h-10 w-fit items-center gap-1 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm">
          Last 90 days
        </div>
      </section>

      <section aria-label="Store performance" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric, index) => {
          const Icon = metricIcons[index];
          return (
            <article key={metric.label} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_8px_rgba(15,23,42,0.025)]">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-600">
                <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
              </div>
              <p className="mt-4 text-sm text-slate-500">{metric.label}</p>
              <p className="mt-1 text-[26px] font-semibold tracking-tight text-slate-900">{metric.value}</p>
              <p className="mt-1 text-xs text-slate-400">
                {index === 0 && `${numberFormatter.format(data.transactions.length)} recorded orders`}
                {index === 1 && `${numberFormatter.format(data.customers.length)} customers on file`}
                {index === 2 && "Calculated from all recorded orders"}
                {index === 3 && `${currencyFormatter.format(expenses)} in recorded expenses`}
              </p>
            </article>
          );
        })}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.85fr)]">
        <SalesOverviewChart data={chartData} />
        <article className="relative flex min-h-[300px] flex-col overflow-hidden rounded-2xl bg-slate-900 p-6 text-white shadow-sm sm:p-7">
          <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full bg-lime-300/10 blur-2xl" aria-hidden="true" />
          <div className="relative flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-lime-300/15 text-lime-300">
              <span className="text-base" aria-hidden="true">✦</span>
            </span>
            <span className="text-sm font-medium text-slate-300">A little insight</span>
          </div>
          <h2 className="relative mt-8 max-w-xs text-[22px] font-semibold leading-snug tracking-tight">
            {bestSeller ? `${bestSeller.productName} is your bestseller.` : "Your shop is ready for its first sale."}
          </h2>
          <p className="relative mt-3 max-w-sm text-sm leading-6 text-slate-400">
            {bestSeller
              ? `${numberFormatter.format(bestSeller.quantitySold)} items sold, bringing in ${currencyFormatter.format(bestSeller.revenue)} in sales.`
              : "Record a transaction to see which products are resonating with your customers."}
          </p>
          <div className="relative mt-auto space-y-2 pt-8 text-sm text-slate-300">
            <p>
              Customer mix: {segmentCount("regular")} regular · {segmentCount("new")} new ·{" "}
              {segmentCount("high-value")} high-value · {segmentCount("inactive")} inactive
            </p>
            <p className="text-xs text-slate-400">
              Inventory: {stockSummary.low} low · {stockSummary.out} out of stock
            </p>
          </div>
        </article>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.025)]">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-5 sm:px-6">
          <div>
            <h2 className="font-semibold text-slate-900">Recent orders</h2>
            <p className="mt-1 text-sm text-slate-500">A quick look at your latest activity.</p>
          </div>
          <span className="text-sm font-medium text-slate-500">Latest</span>
        </div>
        <div className="divide-y divide-slate-100">
          {recentOrders.map((order, index) => (
            <div key={order.id} className="flex items-center gap-3 px-5 py-4 sm:px-6">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${["bg-rose-100 text-rose-700", "bg-sky-100 text-sky-700", "bg-violet-100 text-violet-700", "bg-amber-100 text-amber-700"][index]}`}>
                {order.initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{order.name}</p>
                <p className="mt-0.5 truncate text-xs text-slate-500">{order.item}</p>
              </div>
              <span className={`hidden rounded-full px-2.5 py-1 text-xs font-medium sm:inline-flex ${order.status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                {order.status === "completed" ? "Completed" : "Processing"}
              </span>
              <p className="w-24 text-right text-sm font-semibold text-slate-800">{order.amount}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
