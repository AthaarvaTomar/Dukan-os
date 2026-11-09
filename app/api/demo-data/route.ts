import { assertDemoDataIntegrity } from "@/lib/demo-data/integrity";
import { getServerDemoData } from "@/lib/demo-data/server-store";

export function GET() {
  const data = getServerDemoData();
  assertDemoDataIntegrity(data);
  return Response.json(data, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
