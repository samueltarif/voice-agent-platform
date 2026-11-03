# Especificação Técnica — Módulo de Histórico de Conversas: Gravação de Áudio + Transcrição

> **ESPECIFICAÇÃO PARA REVISÃO. NADA AQUI ESTÁ IMPLEMENTADO OU AUTORIZADO.**
> Gravar e transcrever conversas reais depende de decisões humanas e jurídicas pendentes (aviso de gravação, base legal, acesso, retenção, transferência internacional — seção 6 do desenho de arquitetura e H3/H4 do pacote de decisão).
> Preferência de produto declarada pelo operador: **áudio e transcrição incluídos juntos no mesmo plano comercial**, embora sejam recursos técnicos independentes.
> Invariantes: `ACTIVE_GUARDED = BLOCKED` | `CUSTOMER_TRAFFIC = PROHIBITED` | `PRODUCTION_RUNTIME_WIRING = NO` | `REAL_PROVIDER_CALLS = 0` | `PUBLIC_WEBHOOKS = 0` | `REMOTE_MIGRATIONS = 0`.

## 1. Objetivos de produto

O cliente da plataforma poderá:

1. ver o histórico de chamadas;
2. ouvir a gravação completa (cliente e IA);
3. ler a transcrição separada entre **AGENTE DE IA** e **CLIENTE**;
4. ver *timestamps* e duração;
5. ir de um trecho da transcrição ao trecho correspondente do áudio **somente quando houver sincronização confiável**;
6. baixar áudio e transcrição, se autorizado;
7. consultar tudo respeitando o isolamento por organização e as permissões do usuário.

## 2. Princípios (inegociáveis)

1. **Nada fictício**: estados "indisponível", "processando", "falhou" e "excluído" aparecem como tais. Nunca há áudio, falas ou resultados de exemplo como se fossem reais (mesma regra da 008-MVP4c).
2. **Transcrição ≠ áudio ouvido**:
   - o texto que o agente **gerou** pode não ter sido totalmente **falado**, por causa de *barge-in*, corte de tempo ou queda;
   - sem marcação confiável do fornecedor, falas do agente são rotuladas "texto gerado pelo agente — reprodução integral não confirmada".
3. **Estados distintos da transcrição**:
   - `FINAL`;
   - `PARTIAL` (parcial ou incompleta, por exemplo, só parte da chamada);
   - `UNAVAILABLE`, com motivo;
   - `FAILED`;
   - `DELETED`.
4. **Sem URLs públicas permanentes**: o áudio nunca é servido por link público nem por URL do fornecedor exposta ao navegador.
5. **Gravação dupla não é presumida correta**: a atribuição canal → falante só é marcada como `VERIFIED` depois do teste da Fase 1 (pendência T6 da Twilio); até lá, `UNVERIFIED`.
6. **Isolamento por tenant** em toda consulta, chave de armazenamento e trilha de auditoria.

## 3. Fontes de dados e papel de cada uma

| Fonte | O que oferece (documentado) | Papel proposto |
| :--- | :--- | :--- |
| **Gravação Twilio** | Gravação da chamada em dois canais (pai no canal 1, filha no canal 2 em `<Dial>` duplo); download WAV/MP3 com `RequestedChannels=2`; callback com `RecordingSid`, duração, canais; `DELETE` da gravação; criptografia opcional | **Fonte primária do áudio** (operadora; independente do motor conversacional) e base de conferência |
| **Millis `call-logs` / webhook de fim** | `chat` (**string**, sem papéis ou *timestamps* no schema), `recording` (objeto sem URL definida), `duration`, `call_status`, `cost_breakdown`; `DELETE /call-logs/{session_id}/recording` | **Fonte preferencial da transcrição** — **condicionada** à comprovação de estrutura, papéis e fidelidade (perguntas 7 e 8 à Millis) |
| Afirmações do chatbot da Millis (falantes, *timestamps*, `/v1/calls/...`, `X-Millis-Signature`) | **Não comprovadas** | Não usadas no desenho |
| Transcrição alternativa (Twilio US$ 0,05/min ou outro STT sobre o canal 2) | Disponível no mercado | **Opção de contingência** (decisão D-TRANSCRIPT-SOURCE): só se a Millis não comprovar fidelidade, ou para auditar o que foi realmente falado |

## 4. Modelo de dados proposto (não implementado; migration só após decisões)

```
call_recordings
  id, organization_id (FK), attempt_id (FK composta por tenant), call_session_id
  source            TWILIO | MILLIS
  provider_ref      opaco (RecordingSid / session_id)  — nunca exposto ao navegador
  status            PENDING | PROCESSING | AVAILABLE | FAILED | UNAVAILABLE | DELETED
  unavailable_reason  NOT_RECORDED_BY_POLICY | NO_ANSWER | PROVIDER_ERROR | NOT_CONSENTED | ...
  channels          1 | 2
  channel_map       {1: CUSTOMER, 2: AGENT} | null
  channel_map_status UNVERIFIED | VERIFIED
  duration_ms, started_at
  storage_key       chave privada no armazenamento da plataforma (prefixo por organização)
  content_type, bytes, sha256
  retention_until, legal_hold, deleted_at, deleted_by, provider_deleted_at

call_transcripts
  id, organization_id, attempt_id, call_session_id
  source            MILLIS | TWILIO | OTHER_STT
  status            FINAL | PARTIAL | UNAVAILABLE | FAILED | DELETED
  unavailable_reason, language
  speaker_attribution  PROVIDER_LABELED | INFERRED | NONE
  timing            SEGMENT_TIMESTAMPS | NONE
  agent_text_fidelity  SPOKEN_CONFIRMED | GENERATED_UNCONFIRMED
  retention_until, legal_hold, deleted_at

call_transcript_segments
  transcript_id, seq
  speaker           AGENT | CUSTOMER | UNKNOWN
  text, start_ms (nullable), end_ms (nullable)
  delivery          SPOKEN | INTERRUPTED | UNKNOWN

media_access_audit  (append-only)
  organization_id, user_id, resource (recording|transcript), resource_id
  action            PLAY | DOWNLOAD | DELETE | RETENTION_CHANGE | LEGAL_HOLD
  at, request_fingerprint (hash; sem IP em claro)
```

Regras:

- FKs compostas por tenant, como na 008-MVP1.
- `speaker = UNKNOWN` quando o fornecedor não rotular. A plataforma **não** adivinha falantes por heurística sem marcar `INFERRED`.
- `start_ms`/`end_ms` nulos ⇒ a navegação texto → áudio fica **desabilitada** para aquela transcrição, com a explicação na tela.

## 5. Pipeline de ingestão (após o encerramento confirmado da chamada)

1. Callback assinado de gravação Twilio (`completed`) ou consulta de reconciliação → registro `PENDING`.
2. Worker baixa a mídia **do servidor** (autenticação Basic com chave de API restrita) → calcula SHA-256 → grava no armazenamento privado com chave `org/{orgId}/recordings/{recordingId}` e criptografia em repouso → `AVAILABLE`.
3. Transcrição: após o fim da sessão Millis, consultar `GET /call-logs/{session_id}` (o webhook só dispara a consulta, seção 2.5 do desenho), normalizar em segmentos. Se a estrutura não permitir papéis ou *timestamps*, registrar os níveis `NONE`/`GENERATED_UNCONFIRMED` correspondentes, sem fabricar.
4. **D-COPY** (decisão): após a cópia verificada pelo SHA-256, apagar a gravação no fornecedor (Twilio `DELETE` documentado; Millis `DELETE …/recording` documentado, mas com escopo incerto) para concentrar a retenção sob controle da plataforma.
5. Falhas: retentativas com *backoff*. Esgotadas → `FAILED` visível. Nada de áudio parcial apresentado como completo.

## 6. Acesso, permissões e reprodução

**Permissões propostas** (decisão C-3; mesmo modelo de `campaigns.costs`):

| Permissão | Proposta de papéis | Observação |
| :--- | :--- | :--- |
| `calls.history.read` (lista, metadados, duração) | OWNER, ADMIN, MANAGER, OPERATOR | Telefone mascarado, como hoje |
| `calls.transcript.read` | OWNER, ADMIN, MANAGER | Conteúdo da conversa é dado pessoal |
| `calls.recording.play` | OWNER, ADMIN, MANAGER | — |
| `calls.media.download` | OWNER, ADMIN | Exporta dado pessoal para fora da plataforma |
| `calls.media.delete` / retenção / *legal hold* | OWNER, ADMIN | Ação irreversível; dupla confirmação |

**Reprodução e download:**
- O navegador nunca recebe URL do fornecedor nem URL permanente.
- Opção recomendada: *streaming* pelo BFF/API com verificação de sessão, organização e permissão a cada requisição (suporte a `Range` para navegação no áudio).
- Alternativa: URL assinada de curtíssima duração (≤ 5 min), emitida só após a verificação.
- Toda reprodução, download e exclusão grava `media_access_audit`.
- Download da transcrição em texto ou JSON com cabeçalho de origem, estado (`FINAL`/`PARTIAL`) e avisos de fidelidade.

## 7. Retenção, exclusão e backups

- Política por tenant com teto da plataforma (Constituição, Artigo VIII: configurável, sem presumir prazos legais). Valores padrão: **decisão C-4**.
- Job diário de expiração:
  - apaga o objeto, marca `DELETED`, preserva metadados mínimos e a trilha de auditoria;
  - a transcrição segue a mesma política, com prazos independentes se decidido.
- *Legal hold* suspende a expiração (OWNER/ADMIN, auditado).
- Backups: prazo máximo documentado até a exclusão se propagar (**C-5**); backups cifrados e sem acesso operacional rotineiro.
- Exclusão a pedido do titular (LGPD): exclui gravação e transcrição do número, em todos os registros da organização, e registra a execução.
- Exclusão no fornecedor: Twilio documentado; Millis, escopo do `DELETE` a confirmar.

## 8. Telas (somente dados reais)

- **Histórico** (`/calls` evolui): colunas existentes da 008-MVP4c + indicadores "gravação" e "transcrição" com o estado real.
- **Detalhe da chamada**:
  - player dois canais com rótulos **CLIENTE/AGENTE DE IA** só quando `channel_map_status = VERIFIED`; caso contrário, "Canal 1/Canal 2 (atribuição não verificada)";
  - transcrição em segmentos com rótulos e horários quando existirem;
  - aviso de fidelidade nas falas do agente;
  - clique no trecho → posição no áudio apenas com `timing = SEGMENT_TIMESTAMPS`.
- Estados explícitos: "Gravação não realizada (política)", "Processando", "Indisponível — motivo", "Falhou", "Excluída em {data}".

## 9. Comercial

- Uma *entitlement* única do plano (`conversationHistory`) habilita gravação e transcrição juntas, conforme a preferência declarada.
- Tecnicamente são dois interruptores independentes por organização, para permitir, por exemplo, transcrição sem áudio quando o tenant ou o jurídico exigir.
- Preço e plano: **H6** (decisão comercial).
- O custo de gravação, transcrição e armazenamento entra no ledger como controle operacional.

## 10. Etapas propostas (offline)

| Etapa | Escopo | Testes | Depende de |
| :---: | :--- | :--- | :--- |
| **R1** | Contratos + schema (migration aditiva local) + permissões + estados; leitura vazia na API | Isolamento entre tenants, RBAC por papel, estados explícitos, FKs compostas | C-3, C-4, C-5, H6 |
| **R2** | Pipeline com fornecedores falsos e porta de armazenamento falsa: ingestão, SHA-256, retentativas, expiração, exclusão, *legal hold*, auditoria | Ingestão idempotente, falha → `FAILED`, expiração respeita *legal hold*, exclusão auditada | R1, D-COPY, C-6 |
| **R3** | Telas de histórico e detalhe; *streaming* autorizado com `Range`; download auditado | Sem URL de fornecedor no HTML; rótulos só com atribuição verificada; navegação só com *timestamps* | R2, C-1 |

**Critérios de aceite comuns**:
- zero dado fictício;
- zero URL permanente;
- auditoria de todo acesso a mídia;
- gate canônico verde.

Nenhuma gravação real até a autorização da Fase 1 e o aviso de gravação aprovado (C-1).
