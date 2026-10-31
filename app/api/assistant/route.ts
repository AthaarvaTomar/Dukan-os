import { NextResponse } from "next/server";
import { z } from "zod";
import { assertDemoDataIntegrity } from "@/lib/demo-data/integrity";
import type { DemoData } from "@/lib/demo-data/types";
import { errorAssistantResult, processAssistantMessage } from "@/lib/assistant/service";
import { SarvamApiError } from "@/lib/assistant/sarvam";

export const maxDuration = 10;

const customerSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string(),
  email: z.string(),
  address: z.string(),
  joinedAt: z.string(),
  notes: z.string(),
});

const productSchema = z.object({
  id: z.string(),
  name: z.string(),
  sku: z.string(),
  category: z.enum(["Groceries", "Beverages", "Household", "Personal care", "Snacks", "Stationery"]),
  unit: z.string(),
  price: z.number(),
  costPrice: z.number(),
  stock: z.number(),
  reorderLevel: z.number(),
});

const transactionSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  date: z.string(),
  items: z.array(z.object({
    productId: z.string(),
    productName: z.string(),
    quantity: z.number(),
    unitPrice: z.number(),
    unitCost: z.number(),
  })),
  subtotal: z.number(),
  discount: z.number(),
  totalAmount: z.number(),
  paymentMethod: z.enum(["cash", "upi", "card"]),
  status: z.enum(["completed", "processing"]),
});

const expenseSchema = z.object({
  id: z.string(),
  description: z.string(),
  category: z.enum(["Rent", "Utilities", "Supplies", "Transport", "Marketing", "Maintenance"]),
  amount: z.number(),
  date: z.string(),
  vendor: z.string(),
  notes: z.string(),
});

const campaignSchema = z.object({
  id: z.string(),
  name: z.string(),
  channel: z.enum(["WhatsApp", "Instagram", "In-store", "SMS"]),
  status: z.enum(["draft", "scheduled", "active", "completed"]),
  startDate: z.string(),
  endDate: z.string(),
  budget: z.number(),
  audienceSize: z.number(),
  sentCount: z.number(),
  conversions: z.number(),
  revenue: z.number(),
});

const demoDataSchema = z.object({
  asOf: z.string(),
  customers: z.array(customerSchema),
  products: z.array(productSchema),
  transactions: z.array(transactionSchema),
  expenses: z.array(expenseSchema),
  campaigns: z.array(campaignSchema),
});

const requestSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  data: demoDataSchema,
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Please send a valid JSON request." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please provide a message and a valid current dataset." },
      { status: 400 },
    );
  }

  const data: DemoData = parsed.data.data;
  try {
    assertDemoDataIntegrity(data);
  } catch {
    return NextResponse.json(
      { error: "The supplied dataset has invalid references or dates." },
      { status: 400 },
    );
  }

  const timeoutSignal = AbortSignal.timeout(10_000);
  try {
    const result = await processAssistantMessage(parsed.data.message, data, {
      signal: timeoutSignal,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof SarvamApiError) {
      return NextResponse.json(errorAssistantResult(error.kind), { status: 200 });
    }
    if (timeoutSignal.aborted) {
      return NextResponse.json(errorAssistantResult("timeout"), { status: 200 });
    }
    return NextResponse.json(errorAssistantResult("api_failure"), { status: 200 });
  }
}
