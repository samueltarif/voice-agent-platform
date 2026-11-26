import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { DatabaseInstance } from '../client/connection.js';

export interface LegacyTenant {
  readonly organizationId: string;
  readonly agentId: string;
  readonly agentVersionId: string;
  readonly campaignId: string;
  readonly jobId: string;
}

const one = async (db: DatabaseInstance, query: ReturnType<typeof sql>) =>
  (await db.execute(query)).rows[0] as { id: string };

/**
 * E2 PR 1 — dados de um banco ANTERIOR a uma migration, em SQL explícito só
 * com colunas que existem desde a 0013. O ORM atual não serve para popular um
 * esquema antigo: ele lista todas as colunas do esquema novo (ex.: a 0015
 * acrescentou `outbound_campaigns.scheduling_calendar_id`).
 */
export async function insertLegacyOutboundTenant(
  db: DatabaseInstance,
  input: { readonly tag: string; readonly destinationPhone?: string },
): Promise<LegacyTenant> {
  const run = randomUUID().slice(0, 8);
  const userId = `usr-legacy-${run}`;
  await db.execute(sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES (${userId}, ${`Legacy ${run}`}, ${`legacy-${run}@example.com`}, true, now(), now())`);
  const org = await one(
    db,
    sql`INSERT INTO organizations (slug, name, status) VALUES (${`legacy-${input.tag}-${run}`}, ${`Legacy ${input.tag}`}, 'ACTIVE') RETURNING id`,
  );
  const agent = await one(
    db,
    sql`INSERT INTO agents (organization_id, name, slug, status) VALUES (${org.id}, 'Legacy Agent', ${`legacy-${run}`}, 'ACTIVE') RETURNING id`,
  );
  const version = await one(
    db,
    sql`INSERT INTO agent_versions (organization_id, agent_id, version_number, status, configuration_schema_version, configuration, created_by, published_at, published_by)
      VALUES (${org.id}, ${agent.id}, 1, 'PUBLISHED', 1, ${JSON.stringify({ prompt: 'legacy', tools: [] })}::jsonb, ${userId}, now(), ${userId}) RETURNING id`,
  );
  const campaign = await one(
    db,
    sql`INSERT INTO outbound_campaigns (organization_id, agent_id, agent_version_id, name, status)
      VALUES (${org.id}, ${agent.id}, ${version.id}, ${`Legacy campaign ${input.tag}`}, 'ACTIVE') RETURNING id`,
  );
  const job = await one(
    db,
    sql`INSERT INTO outbound_call_jobs (organization_id, campaign_id, agent_id, agent_version_id, destination_phone, idempotency_key, max_attempts)
      VALUES (${org.id}, ${campaign.id}, ${agent.id}, ${version.id}, ${input.destinationPhone ?? '+15555550100'}, ${`legacy-${run}`}, 3) RETURNING id`,
  );
  return {
    organizationId: org.id,
    agentId: agent.id,
    agentVersionId: version.id,
    campaignId: campaign.id,
    jobId: job.id,
  };
}
