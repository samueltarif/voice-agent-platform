import { sql, type InferSelectModel } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { ORGANIZATION_PHONE_NUMBER_STATUSES } from '../repositories/organization-phone-number-types.js';
import { organizations } from './organizations.js';

export const organizationPhoneNumberStatusEnum = pgEnum(
  'organization_phone_number_status',
  ORGANIZATION_PHONE_NUMBER_STATUSES,
);

/**
 * Metadata de números gerenciados pela operadora, por organização. Nenhuma
 * compra/consulta real ocorre nesta tabela. `e164_number` é globalmente único
 * (inclusive RELEASED): impede reatribuição silenciosa entre tenants.
 */
export const organizationPhoneNumbers = pgTable(
  'organization_phone_numbers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    e164Number: text('e164_number').notNull(),
    twilioPhoneNumberSid: text('twilio_phone_number_sid'),
    status: organizationPhoneNumberStatusEnum('status').notNull().default('ACTIVE'),
    version: integer('version').notNull().default(1),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('organization_phone_numbers_id_org_unique').on(table.id, table.organizationId),
    uniqueIndex('organization_phone_numbers_e164_uidx').on(table.e164Number),
    uniqueIndex('organization_phone_numbers_twilio_sid_uidx')
      .on(table.twilioPhoneNumberSid)
      .where(sql`${table.twilioPhoneNumberSid} IS NOT NULL`),
    index('organization_phone_numbers_org_status_idx').on(table.organizationId, table.status),
    check(
      'organization_phone_numbers_e164_chk',
      sql`${table.e164Number} ~ '^\\+[1-9][0-9]{7,14}$'`,
    ),
    check(
      'organization_phone_numbers_sid_chk',
      sql`${table.twilioPhoneNumberSid} IS NULL OR char_length(${table.twilioPhoneNumberSid}) BETWEEN 1 AND 64`,
    ),
    check('organization_phone_numbers_version_chk', sql`${table.version} > 0`),
    check(
      'organization_phone_numbers_released_chk',
      sql`(${table.status} = 'RELEASED') = (${table.releasedAt} IS NOT NULL)`,
    ),
  ],
);

export type OrganizationPhoneNumberEntity = InferSelectModel<typeof organizationPhoneNumbers>;
