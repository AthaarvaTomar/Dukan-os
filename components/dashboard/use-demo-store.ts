"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  commitDemoData,
  getDemoDataSnapshot,
  getServerDemoDataSnapshot,
  resetDemoData,
  subscribeToDemoData,
} from "@/lib/demo-data/client-store";
import {
  removeById,
  upsertById,
} from "@/lib/demo-data/storage";
import type {
  Customer,
  DemoData,
  Expense,
  MarketingCampaign,
  Product,
  Transaction,
} from "@/lib/demo-data/types";

export function useDemoStore() {
  const data = useSyncExternalStore(
    subscribeToDemoData,
    getDemoDataSnapshot,
    getServerDemoDataSnapshot,
  );

  const commit = useCallback(
    (nextData: DemoData) => {
      commitDemoData(nextData);
    },
    [],
  );

  const upsertCustomer = useCallback(
    (record: Customer) => commit({ ...data, customers: upsertById(data.customers, record) }),
    [commit, data],
  );
  const upsertProduct = useCallback(
    (record: Product) => commit({ ...data, products: upsertById(data.products, record) }),
    [commit, data],
  );
  const upsertTransaction = useCallback(
    (record: Transaction) => commit({ ...data, transactions: upsertById(data.transactions, record) }),
    [commit, data],
  );
  const upsertExpense = useCallback(
    (record: Expense) => commit({ ...data, expenses: upsertById(data.expenses, record) }),
    [commit, data],
  );
  const upsertCampaign = useCallback(
    (record: MarketingCampaign) => commit({ ...data, campaigns: upsertById(data.campaigns, record) }),
    [commit, data],
  );

  const removeCustomer = useCallback(
    (id: string) => commit({ ...data, customers: removeById(data.customers, id) }),
    [commit, data],
  );
  const removeProduct = useCallback(
    (id: string) => commit({ ...data, products: removeById(data.products, id) }),
    [commit, data],
  );
  const removeTransaction = useCallback(
    (id: string) => commit({ ...data, transactions: removeById(data.transactions, id) }),
    [commit, data],
  );
  const removeExpense = useCallback(
    (id: string) => commit({ ...data, expenses: removeById(data.expenses, id) }),
    [commit, data],
  );
  const removeCampaign = useCallback(
    (id: string) => commit({ ...data, campaigns: removeById(data.campaigns, id) }),
    [commit, data],
  );

  const reset = useCallback(() => {
    resetDemoData();
  }, []);

  return {
    data,
    upsertCustomer,
    upsertProduct,
    upsertTransaction,
    upsertExpense,
    upsertCampaign,
    removeCustomer,
    removeProduct,
    removeTransaction,
    removeExpense,
    removeCampaign,
    reset,
  };
}
