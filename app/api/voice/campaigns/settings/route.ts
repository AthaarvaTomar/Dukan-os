import {
  getWhatsAppConfigStatus,
  validateModeSwitch,
  type CampaignExecutionMode,
} from "@/lib/campaigns";

export async function GET() {
  const configStatus = getWhatsAppConfigStatus();

  return Response.json(
    {
      mode: "demo",
      availableModes: [
        {
          id: "demo",
          label: "Simulated / Demo",
          description: "Simulate campaigns safely. No real WhatsApp messages are sent.",
          enabled: true,
          isDefault: true,
        },
        {
          id: "whatsapp",
          label: "Real WhatsApp (Meta Cloud API)",
          description: "Official Meta WhatsApp Cloud API sending.",
          enabled: configStatus.isConfigured,
          badge: configStatus.isConfigured ? "Ready" : "Not Configured",
        },
      ],
      isWhatsAppConfigured: configStatus.isConfigured,
      message: configStatus.message,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const requestedMode =
    typeof body === "object" && body !== null && "mode" in body
      ? (body as { mode: unknown }).mode
      : null;

  if (requestedMode !== "demo" && requestedMode !== "whatsapp") {
    return Response.json(
      { error: "Execution mode must be 'demo' or 'whatsapp'." },
      { status: 400 },
    );
  }

  const switchCheck = validateModeSwitch(requestedMode as CampaignExecutionMode);
  if (!switchCheck.allowed) {
    return Response.json(
      {
        error: switchCheck.reason ?? "Real WhatsApp integration is not configured yet. Campaigns will run in demo mode.",
        isWhatsAppConfigured: false,
        activeMode: "demo",
      },
      { status: 400 },
    );
  }

  return Response.json({
    mode: requestedMode,
    message: "Execution mode updated.",
  });
}

