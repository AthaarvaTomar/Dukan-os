-- Migration 0007: Add UPI ID to businesses for UPI payment QR codes on billing receipts
-- Safe to run multiple times (idempotent). Keeps existing per-merchant RLS intact.

alter table public.businesses
  add column if not exists upi_id text not null default '';
