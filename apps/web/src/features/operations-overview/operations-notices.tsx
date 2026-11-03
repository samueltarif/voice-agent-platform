import * as React from 'react';
import { Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@voice-agent/ui';

const NOTICES = [
  {
    id: 'live',
    title: 'Discagem real desativada',
    text: 'Este ambiente não origina chamadas: campanhas iniciadas apenas agendam contatos.',
  },
  {
    id: 'handoff',
    title: 'Transbordo humano',
    text: 'Os pedidos de transbordo ainda não são registrados no banco; nenhuma fila é exibida.',
  },
  {
    id: 'dispositions',
    title: 'Desfechos da conversa',
    text: 'Atendida, ocupado ou caixa postal dependem da integração com o provedor de telefonia.',
  },
  {
    id: 'transcripts',
    title: 'Transcrições e gravações',
    text: 'Não são armazenadas nesta fase; nada é exibido.',
  },
] as const;

/** O que ainda não existe é dito explicitamente — nunca simulado. */
export function OperationsNotices() {
  return (
    <Card className="border-border/60 shadow-xs" data-testid="operations-notices">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Disponibilidade dos dados</CardTitle>
      </CardHeader>
      <CardContent>
        <ul role="list" className="space-y-3">
          {NOTICES.map((n) => (
            <li
              key={n.id}
              className="flex items-start gap-2 text-xs"
              data-testid={`notice-${n.id}`}
            >
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span>
                <strong className="block text-foreground">{n.title}</strong>
                <span className="text-muted-foreground">{n.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
