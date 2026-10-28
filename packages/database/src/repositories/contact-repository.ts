import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { PlannedContact } from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';
import {
  contactListMembers,
  contactLists,
  contacts,
  contactSuppressions,
  type ContactListEntity,
} from '../schema/contacts.js';
import type { DatabaseExecutor } from './database-executor.js';
import { classifyPostgresFailure } from './outbound-persistence-errors.js';

const IMPORT_CHUNK = 500;

export type CreateContactListOutcome =
  { readonly kind: 'CREATED'; readonly list: ContactListEntity } | { readonly kind: 'NAME_TAKEN' };

export type ImportContactsOutcome =
  | {
      readonly kind: 'IMPORTED';
      readonly created: number;
      readonly existing: number;
      readonly addedToList: number;
      readonly suppressed: number;
    }
  | { readonly kind: 'LIST_NOT_FOUND' };

export interface ListMembersQuery {
  readonly organizationId: string;
  readonly listId: string;
  /** ELIGIBLE exclui qualquer E.164 suprimido para o tenant (fail-closed). */
  readonly eligibility: 'ALL' | 'ELIGIBLE';
  readonly limit: number;
  readonly offset: number;
}

function chunks<T>(items: readonly T[]): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += IMPORT_CHUNK)
    result.push(items.slice(i, i + IMPORT_CHUNK));
  return result;
}

async function upsertChunk(
  tx: DatabaseExecutor,
  input: { org: string; listId: string; rows: PlannedContact[] },
) {
  const inserted = await tx
    .insert(contacts)
    .values(
      input.rows.map((r) => ({
        organizationId: input.org,
        phoneE164: r.phoneE164,
        displayName: r.displayName,
        variables: { ...r.variables },
      })),
    )
    .onConflictDoNothing({ target: [contacts.organizationId, contacts.phoneE164] })
    .returning({ id: contacts.id });
  const phones = input.rows.map((r) => r.phoneE164);
  const ids = await tx
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.organizationId, input.org), inArray(contacts.phoneE164, phones)));
  const members = await tx
    .insert(contactListMembers)
    .values(
      ids.map(({ id }) => ({ listId: input.listId, contactId: id, organizationId: input.org })),
    )
    .onConflictDoNothing()
    .returning({ id: contactListMembers.contactId });
  const [suppressed] = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(contactSuppressions)
    .where(
      and(
        eq(contactSuppressions.organizationId, input.org),
        inArray(contactSuppressions.phoneE164, phones),
      ),
    );
  return { created: inserted.length, added: members.length, suppressed: suppressed?.total ?? 0 };
}

/**
 * 008-MVP1 — contatos e listas por tenant. Deduplicação determinística por
 * (organização, E.164): contato existente é mantido intacto (`existing`) e
 * apenas associado à lista. Toda consulta é escopada por `organizationId`.
 */
export class DrizzleContactRepository {
  constructor(private readonly db: DatabaseInstance) {}

  async createList(organizationId: string, name: string): Promise<CreateContactListOutcome> {
    try {
      const [list] = await this.db
        .insert(contactLists)
        .values({ organizationId, name })
        .returning();
      return { kind: 'CREATED', list: list! };
    } catch (error) {
      if (classifyPostgresFailure(error).kind === 'UNIQUE_VIOLATION') return { kind: 'NAME_TAKEN' };
      throw error;
    }
  }

  listLists(organizationId: string): Promise<ContactListEntity[]> {
    return this.db
      .select()
      .from(contactLists)
      .where(eq(contactLists.organizationId, organizationId))
      .orderBy(asc(contactLists.name));
  }

  async importIntoList(input: {
    readonly organizationId: string;
    readonly listId: string;
    readonly accepted: readonly PlannedContact[];
  }): Promise<ImportContactsOutcome> {
    return this.db.transaction(async (tx) => {
      const [list] = await tx
        .select({ id: contactLists.id })
        .from(contactLists)
        .where(
          and(
            eq(contactLists.id, input.listId),
            eq(contactLists.organizationId, input.organizationId),
          ),
        )
        .for('update');
      if (!list) return { kind: 'LIST_NOT_FOUND' };
      const totals = { created: 0, addedToList: 0, suppressed: 0 };
      for (const rows of chunks(input.accepted)) {
        const r = await upsertChunk(tx, { org: input.organizationId, listId: list.id, rows });
        totals.created += r.created;
        totals.addedToList += r.added;
        totals.suppressed += r.suppressed;
      }
      return { kind: 'IMPORTED', ...totals, existing: input.accepted.length - totals.created };
    });
  }

  listMembers(query: ListMembersQuery) {
    const suppressionJoin = and(
      eq(contactSuppressions.organizationId, contacts.organizationId),
      eq(contactSuppressions.phoneE164, contacts.phoneE164),
    );
    const scope = and(
      eq(contactListMembers.organizationId, query.organizationId),
      eq(contactListMembers.listId, query.listId),
      query.eligibility === 'ELIGIBLE' ? isNull(contactSuppressions.id) : undefined,
    );
    return this.db
      .select({
        contactId: contacts.id,
        phoneE164: contacts.phoneE164,
        displayName: contacts.displayName,
        variables: contacts.variables,
        suppressed: sql<boolean>`${contactSuppressions.id} IS NOT NULL`,
      })
      .from(contactListMembers)
      .innerJoin(
        contacts,
        and(
          eq(contacts.id, contactListMembers.contactId),
          eq(contacts.organizationId, contactListMembers.organizationId),
        ),
      )
      .leftJoin(contactSuppressions, suppressionJoin)
      .where(scope)
      .orderBy(asc(contacts.phoneE164))
      .limit(query.limit)
      .offset(query.offset);
  }
}
