import * as React from 'react';
import type {
  KnowledgeAgentProjection,
  KnowledgeHostileSignal,
  KnowledgeSuspiciousPreviewPassage,
  KnowledgeTechnicalAttribute,
} from '@voice-agent/contracts';
import { ASPECT_LABELS } from './knowledge-retrieval-results';

const SIGNAL_LABELS: Readonly<Record<KnowledgeHostileSignal, string>> = {
  ASSISTANT_COMMAND: 'ordem dirigida ao assistente',
  ROLE_MARKER: 'marcador de papel ou prompt',
  AUTHORITY_CLAIM: 'alegação de autoridade sobre regras',
};

const ATTRIBUTE_LABELS: Readonly<Record<KnowledgeTechnicalAttribute, string>> = {
  PRESSURE: 'Pressão',
  PRESSURE_RANGE: 'Faixa de pressão',
  TEMPERATURE: 'Temperatura',
  TEMPERATURE_RANGE: 'Faixa de temperatura',
  OUTPUT_SIGNAL: 'Sinal de saída',
  SUPPLY_VOLTAGE: 'Alimentação',
  VOLTAGE: 'Tensão',
  CURRENT: 'Corrente',
  POWER: 'Potência',
  APPARENT_POWER: 'Potência aparente',
  FREQUENCY: 'Frequência',
  ACCURACY: 'Precisão',
  DIMENSION: 'Dimensão',
  WEIGHT: 'Peso',
  CABLE_SECTION: 'Seção do cabo',
  POLES: 'Polos',
  SPEED: 'Rotação',
  FLOW_RATE: 'Vazão',
  HEAD: 'Altura manométrica',
  COOLING_CAPACITY: 'Capacidade de refrigeração',
  NOISE_LEVEL: 'Nível de ruído',
  MATERIAL: 'Material',
  PROTECTION_RATING: 'Grau de proteção',
  CONNECTION: 'Conexão',
};

/**
 * Só na comparação ADMINISTRATIVA (B2b): passagens marcadas pelo detector
 * auxiliar. O texto é dado não confiável, exibido como texto (escapado pelo
 * React, sem HTML). Nunca é evidência nem chega ao agente.
 */
export function SuspiciousPassagesNotice(props: {
  readonly passages: readonly KnowledgeSuspiciousPreviewPassage[] | undefined;
}) {
  if (!props.passages || props.passages.length === 0) return null;
  return (
    <section
      data-testid="kb-v2-suspicious"
      className="space-y-2 rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/40"
    >
      <h4 className="text-xs font-semibold text-red-800 dark:text-red-300">
        {`Conteúdo suspeito (${props.passages.length}) — nunca enviado ao agente`}
      </h4>
      <p className="text-[11px] text-red-800 dark:text-red-300">
        O detector é auxiliar e não reconhece todos os ataques. Revise e corrija o documento.
      </p>
      <ul className="space-y-2">
        {props.passages.map((p) => (
          <li
            key={p.citationId}
            className="rounded border border-red-200 bg-background p-2 text-xs"
          >
            <p className="font-medium">{`${p.documentTitle} · trecho ${p.chunkOrdinal + 1}`}</p>
            <p className="text-[11px] text-muted-foreground">
              {p.signals.map((s) => SIGNAL_LABELS[s]).join(', ')}
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words">{p.excerpt}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

const shortSource = (documentId: string, ordinal: number) =>
  `doc. …${documentId.slice(-6)}, trecho ${ordinal + 1}`;

/** O que o agente receberia da v2: só fatos técnicos com fonte, sem texto de documento. */
export function AgentProjectionView(props: {
  readonly projection: KnowledgeAgentProjection | undefined;
}) {
  const p = props.projection;
  if (!p) return null;
  const aspects = p.aspectsRequiringAuthorizedSource.map((a) => ASPECT_LABELS[a]).join(', ');
  return (
    <section data-testid="kb-v2-agent-projection" className="space-y-2 rounded-md border p-3">
      <h4 className="text-xs font-semibold text-foreground">O que o agente receberia (v2)</h4>
      {p.facts.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum fato técnico extraído.</p>
      ) : (
        <table className="w-full text-left text-xs">
          <tbody>
            {p.facts.map((f) => (
              <tr key={`${f.citationId}|${f.attribute}|${f.value}`} className="border-t">
                <td className="py-1 pr-2">{f.subject ?? '—'}</td>
                <td className="py-1 pr-2">{ATTRIBUTE_LABELS[f.attribute]}</td>
                <td className="py-1 pr-2 font-medium">{f.value}</td>
                <td className="py-1 text-muted-foreground">
                  {shortSource(f.documentId, f.chunkOrdinal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {aspects && (
        <p
          role="status"
          data-testid="kb-v2-authorized-source"
          className="text-xs text-amber-800 dark:text-amber-300"
        >
          {`Exige fonte autorizada (documentos não comprovam): ${aspects}. O agente deve dizer que a equipe confirma.`}
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">
        {`Omitidos: ${p.withheldUntrusted} trecho(s) suspeito(s) e ${p.withheldCommercialValues} trecho(s) com valor comercial. Fatos extraídos não provam que o documento esteja correto.`}
      </p>
    </section>
  );
}
