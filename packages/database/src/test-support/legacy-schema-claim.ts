import type { DatabaseInstance } from '../client/connection.js';
import {
  startSend,
  type ClaimInput,
  type ClaimResult,
} from '../repositories/call-attempt-claims.js';
import { lockAttemptRow } from '../repositories/durable-attempt-event-applier.js';

/**
 * SÓ para testes de UPGRADE: povoa um banco ainda num schema ANTERIOR com
 * uma tentativa enviada. As barreiras de envio atuais (campanha, supressão,
 * reconciliação pós-chamada da 0017) consultam tabelas que esse schema ainda
 * não tem; aqui só a transição SEND_STARTED da FSM durável é aplicada, pelo
 * mesmo código do claim de produção.
 */
export function claimSendOnLegacySchema(
  db: DatabaseInstance,
  input: ClaimInput,
): Promise<ClaimResult> {
  return db.transaction(async (tx) => {
    const row = await lockAttemptRow(tx, input);
    if (!row || row.state !== 'ORIGINATION_PENDING') {
      return { kind: 'REJECTED', reason: 'NOT_CLAIMABLE_IN_STATE' } as const;
    }
    return startSend(tx, row, input);
  });
}
