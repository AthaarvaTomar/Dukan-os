"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  businessActions,
  getBusinessDataError,
  getBusinessDataServerSnapshot,
  getBusinessDataSnapshot,
  getBusinessDataStatus,
  subscribeToBusinessData,
} from "@/lib/db/store";
import type {
  Customer,
  Expense,
  MarketingCampaign,
  Product,
  StockOperation,
  SupplierOrderDraft,
} from "@/lib/demo-data/types";

/**
 * Data store for the whole dashboard, backed by Supabase (RLS-scoped to the
 * signed-in merchant's business). Keeps the historical `useDemoStore` name so
 * existing components continue to work unchanged.
 */
export function useDemoStore() {
  const data = useSyncExternalStore(
    subscribeToBusinessData,
    getBusinessDataSnapshot,
    getBusinessDataServerSnapshot,
  );
  const rawStatus = useSyncExternalStore(
    subscribeToBusinessData,
    getBusinessDataStatus,
    () => "loading" as const,
  );
  const error = useSyncExternalStore(
    subscribeToBusinessData,
    getBusinessDataError,
    () => null,
  );

  // "anonymous" only appears briefly before the layout redirects to onboarding;
  // an empty store is the correct thing for pages to render meanwhile.
  const status = rawStatus === "anonymous" ? "ready" : rawStatus;

  const upsertCustomer = useCallback(
    (record: Customer) => businessActions.upsertCustomer(record),
    [],
  );
  const upsertProduct = useCallback(
    (record: Product) => businessActions.upsertProduct(record),
    [],
  );
  const upsertExpense = useCallback(
    (record: Expense) => businessActions.upsertExpense(record),
    [],
  );
  const upsertCampaign = useCallback(
    (record: MarketingCampaign) => businessActions.upsertCampaign(record),
    [],
  );
  const upsertSupplierOrder = useCallback(
    (record: SupplierOrderDraft) => businessActions.upsertSupplierOrder(record),
    [],
  );

  const removeCustomer = useCallback(
    (id: string) => businessActions.removeCustomer(id),
    [],
  );
  const removeProduct = useCallback(
    (id: string) => businessActions.removeProduct(id),
    [],
  );
  const removeExpense = useCallback(
    (id: string) => businessActions.removeExpense(id),
    [],
  );
  const removeCampaign = useCallback(
    (id: string) => businessActions.removeCampaign(id),
    [],
  );
  const removeSupplierOrder = useCallback(
    (id: string) => businessActions.removeSupplierOrder(id),
    [],
  );

  const adjustStock = useCallback(
    (productId: string, operation: StockOperation, quantity: number, reason: string) =>
      businessActions.adjustStock(productId, operation, quantity, reason),
    [],
  );
  const createSale = useCallback(
    (sale: Parameters<typeof businessActions.createSale>[0]) =>
      businessActions.createSale(sale),
    [],
  );
  const cancelSale = useCallback(
    (saleId: string) => businessActions.cancelSale(saleId),
    [],
  );

  return {
    data,
    status,
    error,
    upsertCustomer,
    upsertProduct,
    upsertExpense,
    upsertCampaign,
    upsertSupplierOrder,
    removeCustomer,
    removeProduct,
    removeExpense,
    removeCampaign,
    removeSupplierOrder,
    adjustStock,
    createSale,
    cancelSale,
    reset: businessActions.reset,
  };
}
