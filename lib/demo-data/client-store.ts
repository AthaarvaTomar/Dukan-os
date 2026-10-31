"use client";

import { assertDemoDataIntegrity } from "./integrity.ts";
import {
  clearSavedDemoData,
  isDemoData,
  loadDemoData,
  saveDemoData,
} from "./storage.ts";
import type { DemoData } from "./types.ts";

export type DemoDataLoadStatus = "loading" | "ready" | "error";

const emptyData: DemoData = {
  asOf: "1970-01-01T12:00:00.000Z",
  customers: [],
  products: [],
  transactions: [],
  expenses: [],
  campaigns: [],
};

let currentData = emptyData;
let currentStatus: DemoDataLoadStatus = "loading";
let currentError: string | null = null;
let initialized = false;
let initialization: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent): void {
  if (event.key !== "dukanos.demo-data.v1" && event.key !== null) return;
  if (event.key === null || event.newValue === null) {
    void loadBackendDemoData();
    return;
  }
  try {
    currentData = loadDemoData() ?? emptyData;
    currentStatus = currentData === emptyData ? "loading" : "ready";
    currentError = null;
    notify();
  } catch (error) {
    currentStatus = "error";
    currentError =
      error instanceof Error ? error.message : "Saved store data could not be loaded.";
    notify();
  }
}

async function loadBackendDemoData(): Promise<void> {
  if (initialization) return initialization;
  currentStatus = "loading";
  currentError = null;
  notify();

  initialization = (async () => {
    const savedData = loadDemoData();
    if (savedData) {
      currentData = savedData;
    } else {
      const response = await fetch("/api/demo-data", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Store data request failed with HTTP ${response.status}.`);
      }
      const payload: unknown = await response.json();
      if (!isDemoData(payload)) {
        throw new Error("The server returned invalid store data.");
      }
      assertDemoDataIntegrity(payload);
      currentData = payload;
    }
    currentStatus = "ready";
    currentError = null;
  })()
    .catch((error: unknown) => {
      currentStatus = "error";
      currentError =
        error instanceof Error ? error.message : "Store data could not be loaded.";
    })
    .finally(() => {
      initialization = null;
      notify();
    });

  return initialization;
}

export function subscribeToDemoData(listener: () => void): () => void {
  listeners.add(listener);
  if (!initialized) {
    initialized = true;
    void loadBackendDemoData();
  }
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

export function getDemoDataSnapshot(): DemoData {
  return currentData;
}

export function getServerDemoDataSnapshot(): DemoData {
  return emptyData;
}

export function getDemoDataLoadStatus(): DemoDataLoadStatus {
  return currentStatus;
}

export function getServerDemoDataLoadStatus(): DemoDataLoadStatus {
  return "loading";
}

export function getDemoDataLoadError(): string | null {
  return currentError;
}

export function commitDemoData(data: DemoData): void {
  saveDemoData(data);
  currentData = data;
  currentStatus = "ready";
  currentError = null;
  initialized = true;
  notify();
}

export async function resetDemoData(): Promise<void> {
  clearSavedDemoData();
  currentData = emptyData;
  currentStatus = "loading";
  currentError = null;
  initialized = true;
  notify();
  await loadBackendDemoData();
}
