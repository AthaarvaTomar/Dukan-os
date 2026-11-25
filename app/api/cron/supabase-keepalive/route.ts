import { connection } from "next/server";
import { pingSupabase, verifyCronAuthorization } from "@/lib/supabase/keepalive";

export async function GET(request: Request) {
  await connection();
  if (!verifyCronAuthorization(request.headers.get("authorization"))) {
    return Response.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const result = await pingSupabase();
  if (!result.ok) {
    return Response.json(
      { ok: false, error: result.error, checkedAt: result.checkedAt },
      { status: result.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json(
    { ok: true, checkedAt: result.checkedAt },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
