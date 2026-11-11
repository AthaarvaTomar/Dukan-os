import { DemoCampaignProvider } from "./demo-provider";
import type { CampaignExecutionMode, CampaignExecutionProvider } from "./types";
import { WhatsAppCampaignProvider } from "./whatsapp/provider";

const demoProvider = new DemoCampaignProvider();
const whatsAppProvider = new WhatsAppCampaignProvider();

/**
 * Returns the campaign execution provider for the given mode.
 * Default is DemoCampaignProvider.
 */
export function getExecutionProvider(
  mode: CampaignExecutionMode = "demo",
): CampaignExecutionProvider {
  if (mode === "whatsapp") {
    return whatsAppProvider;
  }
  return demoProvider;
}

/**
 * Validates whether the application is permitted to switch to the requested execution mode.
 * Rejects switching to 'whatsapp' if the Meta credentials are not configured.
 */
export function validateModeSwitch(
  requestedMode: CampaignExecutionMode,
): { allowed: boolean; reason?: string } {
  if (requestedMode === "whatsapp") {
    const status = whatsAppProvider.validateConfiguration();
    if (!status.isConfigured) {
      return {
        allowed: false,
        reason: "Real WhatsApp integration is not configured yet. Campaigns will run in demo mode.",
      };
    }
  }

  return { allowed: true };
}

