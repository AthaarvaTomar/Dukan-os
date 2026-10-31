"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  DashboardPeriod,
  DashboardTrendPoint,
} from "@/lib/demo-data/types";
import { cn } from "@/lib/utils";

export type DashboardMetric =
  | "revenue"
  | "transactions"
  | "estimatedProfit"
  | "newCustomers";

const metricLabels: Record<DashboardMetric, string> = {
  revenue: "Revenue",
  transactions: "Transactions",
  estimatedProfit: "Estimated profit",
  newCustomers: "New customers",
};

const periodLabels: Record<DashboardPeriod, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const numberFormatter = new Intl.NumberFormat("en-IN");

function formatValue(value: number, metric: DashboardMetric): string {
  return metric === "revenue" || metric === "estimatedProfit"
    ? currencyFormatter.format(value)
    : numberFormatter.format(value);
}

export function SalesOverviewChart({
  data,
  period,
  metric,
  onPeriodChange,
}: {
  data: DashboardTrendPoint[];
  period: DashboardPeriod;
  metric: DashboardMetric;
  onPeriodChange: (period: DashboardPeriod) => void;
}) {
  const hasValues = data.some((point) => point[metric] !== 0);

  return (
    <article className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_8px_rgba(15,23,42,0.025)] sm:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-slate-900">Revenue trend</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
              {metricLabels[metric]}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {period === "daily" && "Daily performance over the last 14 days."}
            {period === "weekly" && "Weekly performance over the last 8 weeks."}
            {period === "monthly" && "Monthly performance over the last 6 months."}
          </p>
        </div>
        <div className="inline-flex w-fit rounded-xl border border-slate-200 bg-slate-50 p-1" aria-label="Revenue trend interval">
          {(Object.keys(periodLabels) as DashboardPeriod[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onPeriodChange(value)}
              aria-pressed={period === value}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400",
                period === value
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-800",
              )}
            >
              {periodLabels[value]}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-6 [230px] w-full [250px]">
        {!hasValues ? (
          <div className="flex h-full flex-col items-center justify-center rounded-xl bg-slate-50/70 text-center">
            <p className="text-sm font-medium text-slate-700">No activity for this view yet</p>
            <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">
              There are no matching records in the selected period. Try another interval or add transactions.
            </p>
          </div>
        ) : (
          <div
            className="h-full w-full"
            role="img"
            aria-label={`${metricLabels[metric]} trend, grouped ${period}`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.19} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#eef1f5" strokeDasharray="4 4" />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tickMargin={12}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  tickFormatter={(value: number) =>
                    metric === "revenue" || metric === "estimatedProfit"
                      ? `₹${numberFormatter.format(value)}`
                      : numberFormatter.format(value)
                  }
                  width={64}
                />
                <Tooltip
                  cursor={{ stroke: "#cbd5e1", strokeDasharray: "4 4" }}
                  contentStyle={{
                    border: "1px solid #e2e8f0",
                    borderRadius: 12,
                    boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
                    fontSize: 12,
                  }}
                  formatter={(value) => [formatValue(Number(value), metric), metricLabels[metric]]}
                />
                <Area
                  type="monotone"
                  dataKey={metric}
                  stroke="#10b981"
                  strokeWidth={2.5}
                  fill="url(#salesFill)"
                  activeDot={{ r: 5, fill: "#10b981", stroke: "white", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </article>
  );
}
