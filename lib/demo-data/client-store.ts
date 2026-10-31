"use client";

import { demoData } from "./seed.ts";
import { clearSavedDemoData, loadDemoData, saveDemoData } from "./storage.ts";
import type { DemoData } from "./types.ts";

let currentData = demoData;
let initialized = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent): void {
  if (event.key !== "dukanos.demo-data.v1" && event.key !== null) return;
  currentData = loadDemoData() ?? demoData;
  notify();
}

export function subscribeToDemoData(listener: () => void): () => void {
  listeners.add(listener);
  if (!initialized) {
    const previousData = currentData;
    currentData = loadDemoData() ?? demoData;
    initialized = true;
    if (currentData !== previousData) listener();
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
  return demoData;
}

export function commitDemoData(data: DemoData): void {
  saveDemoData(data);
  currentData = data;
  initialized = true;
  notify();
}

export function resetDemoData(): void {
  clearSavedDemoData();
  currentData = demoData;
  initialized = true;
  notify();
}
