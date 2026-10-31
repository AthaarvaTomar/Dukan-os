import { assertDemoDataIntegrity } from "@/lib/demo-data/integrity";
import { createDemoData } from "@/lib/demo-data/seed";

export function GET() {
  const data = createDemoData();
  assertDemoDataIntegrity(data);
  return Response.json(data, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
