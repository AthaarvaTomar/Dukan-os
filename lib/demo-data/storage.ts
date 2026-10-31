import { assertDemoDataIntegrity } from "./integrity.ts";
import type { DemoData } from "./types.ts";

const STORAGE_KEY = "dukanos.demo-data.v1";
const COLLECTIONS = ["customers", "products", "transactions", "expenses", "campaigns"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isDemoData(value: unknown): value is DemoData {
  return (
    isRecord(value) &&
    typeof value.asOf === "string" &&
    Number.isFinite(Date.parse(value.asOf)) &&
    COLLECTIONS.every(
      (collection) =>
        Array.isArray(value[collection]) &&
        value[collection].every((record: unknown) => isRecord(record) && typeof record.id === "string"),
    )
  );
}

export function loadDemoData(): DemoData | null {
  const storedValue = window.localStorage.getItem(STORAGE_KEY);
  if (storedValue === null) return null;

  const parsed: unknown = JSON.parse(storedValue);
  if (!isRecord(parsed) || parsed.version !== 1 || !isDemoData(parsed.data)) {
    throw new Error("Saved DukaanOS demo data is invalid. Clear the saved demo data to restore defaults.");
  }
  assertDemoDataIntegrity(parsed.data);
  return parsed.data;
}

export function saveDemoData(data: DemoData): void {
  assertDemoDataIntegrity(data);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, data }));
}

export function clearSavedDemoData(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

export function upsertById<T extends { id: string }>(
  records: readonly T[],
  record: T,
): T[] {
  const index = records.findIndex((current) => current.id === record.id);
  if (index === -1) return [...records, record];
  return records.map((current) => (current.id === record.id ? record : current));
}

export function removeById<T extends { id: string }>(records: readonly T[], id: string): T[] {
  return records.filter((record) => record.id !== id);
}
