const SARVAM_RUNTIME_BASE_URL = "https://apps.sarvam.ai/api/app-runtime/";

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const apiKey = process.env.SARVAM_API_KEY?.trim();
  if (!apiKey) {
    return Response.json({ error: "Sarvam voice credentials are not configured." }, { status: 503 });
  }

  const { path } = await context.params;
  const expectedPath = [
    "orgs",
    process.env.SARVAM_ORG_ID,
    "workspaces",
    process.env.SARVAM_WORKSPACE_ID,
    "apps",
    process.env.SARVAM_APP_ID,
    "url",
  ];
  if (
    path.length !== expectedPath.length ||
    path.some((segment, index) => !expectedPath[index] || segment !== expectedPath[index])
  ) {
    return Response.json({ error: "Unsupported Sarvam runtime path." }, { status: 404 });
  }

  const incomingUrl = new URL(request.url);
  const upstreamUrl = `${SARVAM_RUNTIME_BASE_URL}${path.map(encodeURIComponent).join("/")}${incomingUrl.search}`;
  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        "X-API-Key": apiKey,
        Accept: "application/json",
      },
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: "Sarvam voice service is temporarily unavailable." }, { status: 502 });
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: {
      "Content-Type": upstreamResponse.headers.get("Content-Type") ?? "application/json",
      "Cache-Control": "no-store",
    },
  });
}
