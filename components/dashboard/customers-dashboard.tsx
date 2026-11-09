"use client";

import { useMemo, useState } from "react";
import { Search, UsersRound } from "lucide-react";
import { useBusinessInfo } from "@/components/dashboard/business-context";
import { useDemoStore } from "@/components/dashboard/use-demo-store";
import { segmentCustomers } from "@/lib/demo-data/analytics";
import type { CustomerSegment } from "@/lib/demo-data/types";
import { Button } from "@/components/ui/button";

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const numberFormatter = new Intl.NumberFormat("en-IN");
const segmentLabels: Record<CustomerSegment, string> = {
  regular: "Regular",
  inactive: "Inactive",
  new: "New",
  "high-value": "High value",
};
const segmentStyles: Record<CustomerSegment, string> = {
  regular: "bg-sky-50 text-sky-700 ring-sky-600/10",
  inactive: "bg-slate-100 text-slate-600 ring-slate-500/10",
  new: "bg-violet-50 text-violet-700 ring-violet-600/10",
  "high-value": "bg-amber-50 text-amber-700 ring-amber-600/10",
};

function formatPurchaseDate(value: string | null): string {
  if (!value) return "No purchases yet";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function CustomersDashboard() {
  const { businessName } = useBusinessInfo();
  const { data, status, error, reset } = useDemoStore();
  const [query, setQuery] = useState("");
  const [selectedSegment, setSelectedSegment] = useState<CustomerSegment | "all">("all");
  const customers = useMemo(
    () =>
      segmentCustomers(data.customers, data.transactions, new Date(data.asOf)).sort(
        (a, b) => b.totalSpent - a.totalSpent || a.name.localeCompare(b.name),
      ),
    [data.asOf, data.customers, data.transactions],
  );
  const filteredCustomers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("en-IN");
    return customers.filter((customer) => {
      const matchesSegment =
        selectedSegment === "all" || customer.segment === selectedSegment;
      const matchesSearch =
        normalizedQuery.length === 0 ||
        [customer.name, customer.phone, customer.email, customer.address]
          .some((value) => value.toLocaleLowerCase("en-IN").includes(normalizedQuery));
      return matchesSegment && matchesSearch;
    });
  }, [customers, query, selectedSegment]);
  const segmentCounts = useMemo(
    () =>
      customers.reduce(
        (counts, customer) => {
          counts[customer.segment] += 1;
          return counts;
        },
        { regular: 0, inactive: 0, new: 0, "high-value": 0 },
      ),
    [customers],
  );

  const summary = [
    { label: "Total customers", value: numberFormatter.format(customers.length), description: "Across all segments" },
    { label: "Regular customers", value: numberFormatter.format(segmentCounts.regular), description: "Based on recent purchases" },
    { label: "High-value customers", value: numberFormatter.format(segmentCounts["high-value"]), description: "Lifetime spend ₹50,000+" },
    { label: "Inactive customers", value: numberFormatter.format(segmentCounts.inactive), description: "No purchase in 45+ days" },
  ];

  if (status === "loading") {
    return (
      <div className="mx-auto w-full max-w[1440px] animate-pulse space-y-7" role="status">
        <span className="sr-only">Loading customers…</span>
        <div className="h-10 w-56 rounded bg-slate-200" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-32 rounded-2xl bg-white" />)}
        </div>
        <div className="h-96 rounded-2xl bg-white" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <section role="alert" className="mx-auto max-w-2xl rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">We couldn&apos;t load your customers</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {error ?? "The store data service is temporarily unavailable."}
        </p>
        <Button className="mt-5" onClick={() => void reset()}>Retry loading data</Button>
      </section>
    );
  }

  return (
    <div className="mx-auto w-full max-w[1440px] space-y-7">
      <section>
        <p className="mb-2 text-sm font-medium text-slate-500">Customer intelligence</p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-[30px]">
          Your customers
        </h1>
        <p className="mt-1.5 text-sm text-slate-500">
          Get to know the people who keep {businessName} going.
        </p>
      </section>

      <section aria-label="Customer summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map((item) => (
          <article
            key={item.label}
            className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_8px_rgba(15,23,42,0.025)]"
          >
            <p className="text-sm text-slate-500">{item.label}</p>
            <p className="mt-2 text-[26px] font-semibold tracking-tight text-slate-900">
              {item.value}
            </p>
            <p className="mt-1 text-xs text-slate-400">{item.description}</p>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.025)]">
        <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">Customer list</h2>
            <p className="mt-1 text-sm text-slate-500">
              {numberFormatter.format(filteredCustomers.length)} of{" "}
              {numberFormatter.format(customers.length)} customers
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="relative block min-w-0 flex-1 sm:w-72 sm:flex-none">
              <span className="sr-only">Search customers</span>
              <Search
                size={17}
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, phone or email"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              />
            </label>
            <label>
              <span className="sr-only">Filter by customer segment</span>
              <select
                value={selectedSegment}
                onChange={(event) =>
                  setSelectedSegment(event.target.value as CustomerSegment | "all")
                }
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 sm:w-44"
              >
                <option value="all">All segments</option>
                <option value="regular">Regular</option>
                <option value="new">New</option>
                <option value="high-value">High value</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>
        </div>

        {filteredCustomers.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-50 text-slate-500">
              <UsersRound size={22} aria-hidden="true" />
            </span>
            <h3 className="mt-4 font-medium text-slate-900">No customers found</h3>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              Try a different name, phone number, or customer segment.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w[820px] text-left">
                <thead className="bg-slate-50/80 text-xs font-medium text-slate-500">
                  <tr>
                    <th scope="col" className="px-6 py-3.5">Customer</th>
                    <th scope="col" className="px-4 py-3.5">Segment</th>
                    <th scope="col" className="px-4 py-3.5 text-right">Orders</th>
                    <th scope="col" className="px-4 py-3.5 text-right">Total spent</th>
                    <th scope="col" className="px-6 py-3.5 text-right">Last purchase</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCustomers.map((customer) => (
                    <tr key={customer.id} className="transition-colors hover:bg-slate-50/70">
                      <td className="px-6 py-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                            {initials(customer.name)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-800">{customer.name}</p>
                            <p className="mt-0.5 truncate text-xs text-slate-500">{customer.phone}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${segmentStyles[customer.segment]}`}>
                          {segmentLabels[customer.segment]}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right text-sm text-slate-600">
                        {numberFormatter.format(customer.transactionCount)}
                      </td>
                      <td className="px-4 py-4 text-right text-sm font-medium text-slate-800">
                        {currencyFormatter.format(customer.totalSpent)}
                      </td>
                      <td className="px-6 py-4 text-right text-sm text-slate-500">
                        {formatPurchaseDate(customer.lastPurchaseAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-slate-100 md:hidden">
              {filteredCustomers.map((customer) => (
                <article key={customer.id} className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                      {initials(customer.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-slate-800">{customer.name}</p>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${segmentStyles[customer.segment]}`}>
                          {segmentLabels[customer.segment]}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{customer.phone}</p>
                      <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                        <span className="text-slate-500">
                          {numberFormatter.format(customer.transactionCount)} orders ·{" "}
                          {formatPurchaseDate(customer.lastPurchaseAt)}
                        </span>
                        <span className="shrink-0 font-semibold text-slate-800">
                          {currencyFormatter.format(customer.totalSpent)}
                        </span>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
      <p className="text-xs leading-5 text-slate-400">
        Segments are based on demo purchase history: inactive means no purchase in 45+ days;
        high-value means lifetime spend of at least ₹50,000.
      </p>
    </div>
  );
}
