import * as React from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@voice-agent/ui';
import { KnowledgeOperationAlert } from '../../knowledge/knowledge-dialog-shell';
import { SimulatorConversationTurn } from './simulator-conversation-turn';
import {
  SIMULATED_QUESTION_MAX_CHARS,
  type SimulatedConversationState,
} from './use-simulated-conversation';

export interface SimulatorConversationViewProps {
  readonly state: SimulatedConversationState;
  readonly agentName: string;
  readonly publishedVersionNumber: number;
}

function ConversationForm({ state }: { readonly state: SimulatedConversationState }) {
  const tooLong = state.draft.length > SIMULATED_QUESTION_MAX_CHARS;
  return (
    <form
      className="space-y-1"
      onSubmit={(e) => {
        e.preventDefault();
        void state.send();
      }}
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="simulator-question" className="sr-only">
          Pergunta
        </label>
        <Input
          id="simulator-question"
          className="h-10 flex-1 text-sm"
          placeholder="Ex.: Quais transmissores de pressão a empresa oferece?"
          value={state.draft}
          maxLength={SIMULATED_QUESTION_MAX_CHARS}
          disabled={state.pending}
          onChange={(e) => state.setDraft(e.target.value)}
        />
        <Button
          type="submit"
          size="sm"
          className="min-h-[40px] gap-2"
          data-testid="simulator-send"
          disabled={state.pending || !state.draft.trim() || tooLong}
        >
          {state.pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="h-4 w-4" aria-hidden="true" />
          )}
          Enviar
        </Button>
      </div>
      <p className="text-right text-[11px] text-muted-foreground">
        {`${state.draft.length}/${SIMULATED_QUESTION_MAX_CHARS}`}
      </p>
    </form>
  );
}

/**
 * Conversa simulada (DEC-061). Cada resposta é montada pelo servidor com textos
 * fixos e trechos da versão publicada; nada aqui é inventado no navegador. O
 * conteúdo dos documentos é exibido como texto (escapado pelo React).
 */
export function SimulatorConversationView(props: SimulatorConversationViewProps) {
  const { state } = props;
  return (
    <Card role="region" aria-labelledby="simulator-chat-title" data-testid="simulator-conversation">
      <CardHeader className="space-y-1">
        <CardTitle id="simulator-chat-title" className="text-base">
          Conversa simulada
        </CardTitle>
        <p className="text-xs text-muted-foreground" data-testid="simulator-chat-identity">
          {`Agente: ${props.agentName} · Versão publicada nº ${props.publishedVersionNumber}`}
        </p>
        <p className="text-xs text-muted-foreground">
          Usa sempre a versão publicada e só os documentos liberados para este agente. Respostas
          determinísticas do servidor — sem IA, voz ou telefonia. Nada é salvo.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {state.entries.length === 0 ? (
          <p className="text-xs text-muted-foreground" data-testid="simulator-chat-empty">
            Faça uma pergunta para ver como o agente consultaria os documentos.
          </p>
        ) : (
          <ol className="space-y-4" aria-live="polite">
            {state.entries.map((entry) => (
              <SimulatorConversationTurn
                key={entry.id}
                question={entry.question}
                turn={entry.response.turn}
              />
            ))}
          </ol>
        )}
        {state.pending && (
          <p
            role="status"
            className="text-xs text-muted-foreground"
            data-testid="simulator-pending"
          >
            Consultando os documentos da versão publicada…
          </p>
        )}
        {state.failure && <KnowledgeOperationAlert failure={state.failure} />}
        <ConversationForm state={state} />
      </CardContent>
    </Card>
  );
}
