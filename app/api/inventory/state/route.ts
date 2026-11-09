import { z } from "zod";
import { assertDemoDataIntegrity } from "@/lib/demo-data/integrity";
import { getServerDemoData, updateServerInventory } from "@/lib/demo-data/server-store";

const productSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  sku: z.string().trim().min(1),
  category: z.enum(["Groceries", "Beverages", "Household", "Personal care", "Snacks", "Stationery"]),
  unit: z.string().trim().min(1),
  price: z.number().finite().min(0),
  costPrice: z.number().finite().min(0),
  stock: z.number().int().min(0),
  reorderLevel: z.number().int().min(0),
  supplierName: z.string().optional(),
  lastUpdatedAt: z.string().datetime().optional(),
});

const movementSchema = z.object({
  id: z.string().min(1),
  productId: z.string().min(1),
  productName: z.string().trim().min(1),
  operation: z.enum(["stock-in", "stock-out", "adjustment"]),
  quantityChanged: z.number().int(),
  previousStock: z.number().int().min(0),
  newStock: z.number().int().min(0),
  reason: z.string().trim().min(1),
  createdAt: z.string().datetime(),
});

const supplierOrderSchema = z.object({
  id: z.string().min(1),
  supplierName: z.string().trim().min(1),
  status: z.enum(["draft", "approved"]),
  createdAt: z.string().datetime(),
  approvedAt: z.string().datetime().optional(),
  items: z.array(z.object({
    productId: z.string().min(1),
    productName: z.string().trim().min(1),
    currentStock: z.number().int().min(0),
    reorderQuantity: z.number().int().min(1),
    purchaseCost: z.number().finite().min(0),
    estimatedAmount: z.number().finite().min(0),
  })).min(1),
});

const inventoryStateSchema = z.object({
  products: z.array(productSchema),
  inventoryMovements: z.array(movementSchema),
  supplierOrders: z.array(supplierOrderSchema),
});

export async function PUT(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).origin !== new URL(request.url).origin) {
    return Response.json({ error: "Cross-origin inventory updates are not allowed." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Please send a valid inventory update." }, { status: 400 });
  }

  const parsed = inventoryStateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "The inventory update contains invalid fields." }, { status: 400 });
  }

  const skus = parsed.data.products.map((product) => product.sku.trim().toLocaleLowerCase("en-IN"));
  if (new Set(skus).size !== skus.length) {
    return Response.json({ error: "Product SKUs must be unique." }, { status: 409 });
  }

  try {
    assertDemoDataIntegrity({
      ...getServerDemoData(),
      ...parsed.data,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "The inventory update is invalid." },
      { status: 400 },
    );
  }

  updateServerInventory(
    parsed.data.products,
    parsed.data.inventoryMovements,
    parsed.data.supplierOrders,
  );
  return Response.json({ updated: true });
}
