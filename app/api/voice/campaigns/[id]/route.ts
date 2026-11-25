import { z } from "zod";
import {
  updatePendingCampaignMessage,
  updatePendingCampaignSettings,
} from "@/lib/demo-data/server-store";
import {
  resolveServerBusiness,
  updateDraftMessageDb,
  updateDraftSettingsDb,
} from "@/lib/db/voice-campaigns";

const messageUpdateSchema = z.object({
  customerId: z.string().min(1),
  message: z.string().trim().min(1).max(1000),
});

const settingsUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    targetSegment: z.enum(["all", "inactive", "regular", "new", "high-value"]).optional(),
    offerText: z.string().trim().min(1).max(200).optional(),
    templateText: z.string().trim().max(1000).optional(),
    cooldownDays: z.number().int().min(0).max(365).optional(),
    messageCap: z.number().int().min(1).max(5000).optional(),
  })
  .refine((val) => Object.keys(val).length > 0, {
    message: "Provide at least one campaign field to update.",
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

  const { id } = await context.params;
  const business = await resolveServerBusiness();

  // Case 1: Editing an individual customer's message -> increments version & clears approved_version
  const messageParsed = messageUpdateSchema.safeParse(body);
  if (messageParsed.success) {
    if (business) {
      const updated = await updateDraftMessageDb(
        business.db,
        business.businessId,
        id,
        messageParsed.data.customerId,
        messageParsed.data.message,
      );
      if (!updated) {
        return Response.json(
          { error: "Campaign draft or customer message was not found." },
          { status: 404 },
        );
      }
      return Response.json({
        customerId: messageParsed.data.customerId,
        message: messageParsed.data.message,
        version: updated.draft.version,
        approvedVersion: updated.draft.approvedVersion,
        status: updated.draft.status,
        pending: {
          ...updated.draft,
          eligibleCustomerCount: updated.draft.eligibleCount ?? updated.draft.messages.length,
        },
      });
    }

    const draft = updatePendingCampaignMessage(
      id,
      messageParsed.data.customerId,
      messageParsed.data.message,
    );
    if (!draft) {
      return Response.json(
        { error: "Campaign draft or customer message was not found." },
        { status: 404 },
      );
    }
    return Response.json({
      customerId: messageParsed.data.customerId,
      message: messageParsed.data.message,
      version: draft.version,
      approvedVersion: draft.approvedVersion,
      status: draft.status,
      pending: {
        ...draft,
        eligibleCustomerCount: draft.eligibleCount ?? draft.messages.length,
      },
    });
  }

  // Case 2: Editing campaign config -> increments version, clears approved_version, recomputes audience
  const settingsParsed = settingsUpdateSchema.safeParse(body);
  if (settingsParsed.success) {
    if (business) {
      const updated = await updateDraftSettingsDb(
        business.db,
        business.businessId,
        id,
        settingsParsed.data,
      );
      if (!updated) {
        return Response.json({ error: "Campaign draft was not found." }, { status: 404 });
      }
      return Response.json({
        pending: {
          ...updated,
          eligibleCustomerCount: updated.eligibleCount ?? updated.messages.length,
        },
      });
    }

    const updated = updatePendingCampaignSettings(id, settingsParsed.data);
    if (!updated) {
      return Response.json({ error: "Campaign draft was not found." }, { status: 404 });
    }
    return Response.json({
      pending: {
        ...updated,
        eligibleCustomerCount: updated.eligibleCount ?? updated.messages.length,
      },
    });
  }

  return Response.json(
    { error: "Message must contain between 1 and 1000 characters, or provide valid campaign settings." },
    { status: 400 },
  );
}
