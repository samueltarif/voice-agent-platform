import { and, eq } from 'drizzle-orm';
import type { DatabaseInstance } from '../client/connection.js';
import type { CreateOutboundCampaignInput, OutboundCampaign } from '@voice-agent/contracts';
import { outboundCampaigns } from '../schema/outbound.js';
import { agentVersions } from '../schema/agents.js';
import { mapOutboundCampaign } from './outbound-mapping.js';

export async function createOutboundCampaign(
  db: DatabaseInstance,
  input: CreateOutboundCampaignInput,
): Promise<OutboundCampaign> {
  const [version] = await db
    .select({ id: agentVersions.id, status: agentVersions.status })
    .from(agentVersions)
    .where(
      and(
        eq(agentVersions.id, input.agentVersionId),
        eq(agentVersions.organizationId, input.organizationId),
        eq(agentVersions.agentId, input.agentId),
      ),
    )
    .limit(1);

  if (!version || version.status !== 'PUBLISHED') {
    throw new Error('Cannot create campaign: agent version must be PUBLISHED.');
  }

  const [created] = await db
    .insert(outboundCampaigns)
    .values({
      organizationId: input.organizationId,
      agentId: input.agentId,
      agentVersionId: input.agentVersionId,
      name: input.name,
      description: input.description,
      status: input.status,
    })
    .returning();

  return mapOutboundCampaign(created!);
}

export async function getOutboundCampaignById(
  db: DatabaseInstance,
  organizationId: string,
  campaignId: string,
): Promise<OutboundCampaign | null> {
  const [row] = await db
    .select()
    .from(outboundCampaigns)
    .where(
      and(
        eq(outboundCampaigns.organizationId, organizationId),
        eq(outboundCampaigns.id, campaignId),
      ),
    )
    .limit(1);

  return row ? mapOutboundCampaign(row) : null;
}
