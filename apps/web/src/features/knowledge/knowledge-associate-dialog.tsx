import * as React from 'react';
import { Bot } from 'lucide-react';
import type { KnowledgeDocumentResponse } from '@voice-agent/contracts';
import type { OrganizationAgentOption } from '../../lib/knowledge/knowledge-document-management-client';
import { KnowledgeDialogShell } from './knowledge-dialog-shell';
import { IngestField } from './knowledge-ingest-field';
import type { KnowledgeOperationFailure } from './knowledge-operation-failure';

const ALL_AGENTS = '';
const SELECT =
  'w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';

interface AssociateDialogProps {
  readonly doc: KnowledgeDocumentResponse | null;
  readonly agents: readonly OrganizationAgentOption[];
  readonly agentsUnavailable: boolean;
  readonly pending: boolean;
  readonly failure: KnowledgeOperationFailure | null;
  readonly onClose: () => void;
  readonly onSubmit: (agentId: string | null) => void;
}

/** Só agentes ATIVOS desta organização; "todos" libera para qualquer agente da organização. */
export function KnowledgeAssociateDialog(props: AssociateDialogProps) {
  const { doc, pending } = props;
  // O pai remonta o diálogo (key) a cada documento: o valor inicial é a associação atual.
  const [selected, setSelected] = React.useState(doc?.agentId ?? ALL_AGENTS);
  const active = props.agents.filter((a) => a.status === 'ACTIVE');
  const unchanged = selected === (doc?.agentId ?? ALL_AGENTS);
  return (
    <KnowledgeDialogShell
      open={doc !== null}
      testId="kb-associate-dialog"
      title="Associar a agente"
      icon={<Bot className="h-5 w-5 text-primary" aria-hidden="true" />}
      description="Escolha qual agente pode consultar este documento. Sem agente específico, todos os agentes desta organização podem consultá-lo."
      pending={pending}
      failure={props.failure}
      confirmLabel="Salvar associação"
      pendingLabel="Salvando..."
      confirmDisabled={unchanged}
      onClose={props.onClose}
      onConfirm={() => props.onSubmit(selected === ALL_AGENTS ? null : selected)}
    >
      <IngestField id="kb-agent" label="Agente" required>
        <select
          id="kb-agent"
          className={SELECT}
          value={selected}
          disabled={pending}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value={ALL_AGENTS}>Todos os agentes da organização</option>
          {active.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </IngestField>
      {props.agentsUnavailable && (
        <p role="status" className="text-[11px] text-amber-700 dark:text-amber-300">
          Não foi possível carregar a lista de agentes. Você ainda pode liberar para todos.
        </p>
      )}
      {!props.agentsUnavailable && active.length === 0 && (
        <p role="status" className="text-[11px] text-muted-foreground">
          Nenhum agente ativo nesta organização. Crie um agente no Agente IA para associá-lo.
        </p>
      )}
    </KnowledgeDialogShell>
  );
}
