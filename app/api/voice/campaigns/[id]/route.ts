import { z } from "zod";
import { updatePendingCampaignMessage } from "@/lib/demo-data/server-store";
import { resolveServerBusiness, updateDraftMessageDb } from "@/lib/db/voice-campaigns";

const updateSchema = z.object({
  customerId: z.string().min(1),
  message: z.string().trim().min(1).max(1000),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Please send a valid JSON request." }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Message must contain between 1 and 1000 characters." }, { status: 400 });
  }

  const { id } = await context.params;
  const business = await resolveServerBusiness();
  if (business) {
    const updated = await updateDraftMessageDb(
      business.db,
      id,
      parsed.data.customerId,
      parsed.data.message,
    );
    if (!updated) {
      return Response.json({ error: "Campaign draft or customer message was not found." }, { status: 404 });
    }
    return Response.json({
      customerId: parsed.data.customerId,
      message: parsed.data.message,
    });
  }

  const draft = updatePendingCampaignMessage(
    id,
    parsed.data.customerId,
    parsed.data.message,
  );
  if (!draft) {
    return Response.json({ error: "Campaign draft or customer message was not found." }, { status: 404 });
  }
  return Response.json({
    customerId: parsed.data.customerId,
    message: parsed.data.message,
  });
}
