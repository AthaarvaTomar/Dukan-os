const requiredVariables = [
  "SARVAM_API_KEY",
  "SARVAM_ORG_ID",
  "SARVAM_WORKSPACE_ID",
  "SARVAM_APP_ID",
] as const;

export function GET(request: Request) {
  const { pathname } = new URL(request.url);
  if (!pathname.endsWith("/api/voice/config")) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  const missing = requiredVariables.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    return Response.json(
      { configured: false, missing },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json({
    configured: true,
    toolsConfigured: Boolean(process.env.SARVAM_TOOL_API_TOKEN?.trim()),
    config: {
      org_id: process.env.SARVAM_ORG_ID,
      workspace_id: process.env.SARVAM_WORKSPACE_ID,
      app_id: process.env.SARVAM_APP_ID,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
