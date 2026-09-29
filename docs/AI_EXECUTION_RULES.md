# Regras Operacionais e de Segurança de Execução para Agentes de IA (docs/AI_EXECUTION_RULES.md)

Este documento complementa o [AGENTS.md](file:///D:/voice-agent-platform/AGENTS.md) detalhando padrões operacionais mandatórios, exemplos explícitos de práticas permitidas e proibidas, invariantes de ciclo de vida e o checklist pré-execução para agentes de IA operando neste repositório.

O cumprimento destas diretrizes é estrito e inegociável.

---

## 1. Proibição Absoluta de Acesso a Storages e Logs Internos da IDE

Agentes de IA são **TERMINANTEMENTE PROIBIDOS** de ler, abrir, pesquisar, listar recursivamente, parsear, escrever ou utilizar como scratch qualquer diretório ou arquivo pertencente ao storage interno da IDE, ferramenta de suporte ou runtime do agente.

### Escopos Abrangidos
- `.system_generated/` (incluindo subdiretórios de logs, tasks e execuções de steps)
- `.gemini/` e `.agents/` internos da IDE
- `antigravity-ide/` e `antigravity-ide/brain/`
- Arquivos de log de background tasks (`task-*.log`, `task logs`)
- Histórico interno da IDE, histórico de terminal e histórico de comandos
- Transcripts internos (`transcript*.jsonl`, histórico de sessões anteriores)
- Internal agent storage e qualquer scratchpad não versionável fora de `scripts/`

### Inaplicabilidade de Exceções
Esta proibição aplica-se **SEM EXCEÇÃO**, mesmo quando o objetivo alegado for:
- "Apenas depurar um erro de compilação ou teste";
- "Recuperar o prompt ou o contexto anterior que foi compactado";
- "Identificar o PID ou porta de um servidor que falhou";
- "Verificar a saída de um script de cleanup";
- "Criar um helper temporário ou salvar dados de rascunho".

> [!CAUTION]
> **Se o contexto estiver ausente ou tiver sido compactado**: O agente DEVE solicitar esclarecimento diretamente ao operador humano ou restringir-se estritamente ao contexto fornecido no turno atual. É terminantemente proibido tentar reconstruir prompts acessando logs ou transcripts internos.

---

## 2. Blindagem e Não Exibição de Segredos (Never Print Secrets)

Nenhum valor de credencial ou segredo pode ser impresso, exibido em tela, ecoado no terminal, logado ou retornado em respostas.

### Escopos Abrangidos
A proibição abrange:
- Senhas (*passwords*) e hashes;
- Tokens de sessão (*session tokens*), cookies e cabeçalhos de autenticação;
- JWTs compactos e tokens de asserção (*Bearer tokens*);
- Chaves privadas (JWK privado, parâmetros `"d"`, chaves PEM, certificados privados);
- Chaves de API (*API keys*), tokens de provedores externos e tokens do GitHub;
- Segredos de autenticação (`BETTER_AUTH_SECRET`, webhook signing secrets, chaves HMAC);
- Connection strings literais e DSNs (`DATABASE_URL`, `MIGRATION_DATABASE_URL`, `postgresql://...`);
- Credenciais de provedores externos (Twilio, OpenAI, Stripe, AWS, Neon, etc.).

### Regra do "Apenas Local"
A regra aplica-se de forma idêntica a ambientes de:
- Produção
- Staging
- Desenvolvimento
- **Localhost e Docker local**
- **Credenciais sintéticas e temporárias de E2E**

> [!IMPORTANT]
> A justificativa *"é apenas uma credencial sintética/local de teste"* **NÃO CONSTITUI EXCEÇÃO**. O agente nunca deve imprimir key material ou senhas em saídas ou logs.

---

## 3. Verificações de Segredos Baseadas Exclusivamente em Booleanos (Value-Blind)

Toda auditoria ou validação de segredos no repositório, em arquivos ou em diffs do Git deve ser **estritamente cega a valores** (*value-blind*).

### Saídas Permitidas vs. Proibidas
- **Permitidas**: `PRESENT` / `ABSENT`, `PASS` / `FAIL`, `VALID` / `INVALID`, `count`, `exit code`.
- **Proibidas**: Linha coincidente (*matching line*), substring coincidente, valor parcial, prefixo/sufixo de token, fingerprint derivado de secret real ou conteúdo do arquivo secreto.
- **Auditoria de Git**: Auditorias de segredos em diffs do Git devem retornar unicamente:
  - `SECRET_AUDIT_PASS`
  - `SECRET_AUDIT_FAIL` (em caso de falha, interromper sem imprimir a linha que disparou o erro).

---

## 4. Proteção de Arquivos de Ambiente (.env) e Processos

### 4.1 Arquivos `.env`
- É proibido executar comandos como `cat .env`, `type .env`, `Get-Content .env` em `.env`, `.env.local`, `.env.staging`, `.env.production` ou equivalentes.
- Verificações em arquivos de ambiente devem aferir apenas a presença booleana de variáveis de configuração necessárias, sem exibir seus valores.

### 4.2 Inspeção Segura de Processos
- **Permitido**: Consultar PID, nome do executável (`node.exe`), porta TCP em escuta (`Get-NetTCPConnection`), endpoint de healthcheck (`/healthz`), status de execução (running/stopped) e exit code.
- **Proibido**: Inspecionar ou exibir linha de comando (`CommandLine`), argumentos completos (`argv`), bloco de variáveis de ambiente (`process.env`) ou consultas WMI como `Win32_Process.CommandLine`.

---

## 5. Diretrizes para Banco de Dados e Sessões

### 5.1 Proibição de DSNs Literais em Linhas de Comando
- É terminantemente proibido passar connection strings ou DSNs contendo senhas ou tokens como argumentos literais de terminal (inclusive para `localhost:5432`).
- Scripts e utilitários devem ler a configuração exclusivamente a partir das variáveis de ambiente padronizadas (`DATABASE_URL`, `TEST_DATABASE_URL`), utilizando a infraestrutura tipada de [packages/database](file:///D:/voice-agent-platform/packages/database).

### 5.2 Segurança de Sessões Better Auth
- **Proibido**: Executar `SELECT token FROM session`, consultar diretamente a coluna `session.token`, copiar cookies de autenticação manualmente entre ferramentas ou usar tokens extraídos do banco em headers HTTP.
- **Canônico**: Testes de ponta a ponta (E2E) que necessitam de autenticação devem utilizar as rotas oficiais de Better Auth (`/api/auth/sign-in/email`) e/ou o contexto de cookies do navegador real.
- O banco de dados pode ser consultado para conferir presença e status de usuários ou membros, mas **nunca** para extrair segredos de autenticação.

---

## 6. Governança Criptográfica em Testes (Ed25519 e Chaves Efêmeras)

Ao executar testes de validação criptográfica (ex.: asserções entre serviços `apps/web` e `apps/api`):
1. **Geração Efêmera em Memória**: Par de chaves Ed25519 gerado em tempo de execução via `generateKeyPair('EdDSA', { crv: 'Ed25519' })`.
2. **Segregação de Material**: A chave privada deve residir unicamente na memória do processo assinador. O processo verificador recebe estritamente o JWKS público.
3. **Proibição de Persistência e Exibição**: Nunca salvar chave privada em arquivo de disco; nunca executar `console.log` de JWK privada, chave PEM ou JWT resultante.
4. **Saídas de Diagnóstico**: Diagnósticos permitidos são estritamente booleanos: `KEYPAIR_GENERATED=true`, `SIGN_OK=true`, `VERIFY_OK=true`.

---

## 7. Credenciais Sintéticas e Isolamento de Helpers

### 7.1 Credenciais Sintéticas
- Senhas e dados de autenticação para usuários de teste E2E devem existir **exclusivamente em runtime/memória**.
- É proibido criar arquivos persistidos como `test-data.json`, fixtures JSON ou scratch files contendo campos de senha (`password: "..."`).

### 7.2 Helpers Temporários
- Caso seja indispensável criar um script auxiliar para execução de teardown ou diagnóstico, este DEVE residir em caminho rastreável do repositório:
  - Exemplo permitido: `scripts/tmp-<proposito>.mjs`
  - Proibido: criar scripts em `.system_generated/`, `.gemini/` ou diretórios internos da IDE.
- **Teardown Obrigatório**: Todo helper temporário deve ser deletado do disco **antes** de qualquer commit. O `git status` antes de commitar deve estar rigorosamente livre de utilitários sintéticos.

---

## 8. Integridade de Fixtures e Proibição de Patches Manuais

### 8.1 Invariantes de Domínio em Fixtures
- Fixtures de teste não podem criar estados ilegais que o produto real seria incapaz de criar.
- **Prioridade Canônica**: Criar dados de teste através dos serviços de domínio, repositórios e fábricas canônicas (`AgentLifecycleService`, `AgentDraftService`).
- **SQL Direto**: Se queries diretas forem inevitáveis em testes de infraestrutura, todas as invariantes e constraints do domínio devem ser estritamente preservadas (ex.: `next_version_number`, unicidade de rascunhos, unicidade de versão publicada, `organizationId`, status ativo/arquivado, quotas comerciais).

### 8.2 Proibição de Modificação Manual para Fazer Cenário Passar
- É expressamente proibido executar `UPDATE`, `INSERT` ou `DELETE` manuais durante a depuração de um teste apenas para forçar o cenário funcional a passar.
- Se um teste falhar devido a inconsistência de dados:
  1. **PARAR** a execução imediatamente.
  2. Classificar o problema na raiz: `PRODUCT BUG` ou `FIXTURE SETUP BUG`.
  3. Corrigir a causa raiz no código ou na montagem da fixture.
  4. Adicionar teste de regressão automatizado que comprove a solução definitiva.
- **Cleanup Controlado**: Scripts de limpeza e teardown são permitidos desde que sejam escopados por identificador único de execução (`runId`), não contenham segredos e garantam **zero resíduos** no banco.

---

## 9. Terminologia e Estados Normativos de Validação

Em relatórios, auditorias e no `AI_WORKLOG.md`, os agentes devem empregar estritamente a terminologia canônica:

| Estado | Significado Normativo |
|---|---|
| `PLANNED` | Requisito formalmente desenhado e catalogado, mas com código ainda não escrito. |
| `IMPLEMENTED` | O código-fonte, contratos, endpoints e componentes foram criados, respeitando contratos e tipagem. |
| `TESTED` | Testes automatizados relevantes (unitários ou de integração) foram executados e passaram localmente. |
| `VALIDATED` | O fluxo funcional relevante foi comprovado no ambiente apropriado para aquele fluxo, com as dependências reais exigidas pelo claim (ex.: fluxo de navegador autenticado exige browser real e backend real). |
| `PROVIDER-UNVERIFIED` | Integração ou capacidade relacionada a provedor externo desenhada/implementada, mas ainda não comprovada contra o provedor real pago (ex.: tráfego telefônico Twilio real). |
| `BLOCKED` | O fluxo ou gate não pode avançar devido a dependência técnica, bloqueio de credencial ou decisão humana pendente. |
| `NÃO VERIFICADO` | Nenhuma evidência factual foi produzida; é vedado assumir funcionamento sem teste comprovado. |

### Regras Adicionais de Evidência
- Captura de tela visual (*screenshot*) **NÃO** equivale a validação funcional completa (E2E).
- Captura de tela não autenticada **NÃO** valida fluxos autenticados.
- Indisponibilidade de ferramenta de browser **NÃO** significa falha da aplicação.
- Componentes puramente determinísticos (como state machines e orchestrator skeletons) podem atingir `IMPLEMENTED` e `TESTED` sem necessidade de browser ou provedores externos, mas **NUNCA** devem ser classificados como `VALIDATED` em nível de provedor sem teste contra provedor real.

---

## 10. Fronteiras de Domínio e Autoridade de Voz (Preparação para Fase 6)

### 10.1 Desacoplamento Estrito de SDKs Externos (Provider-Neutral)
- O código de negócio e domínio da aplicação **NUNCA** deve importar SDKs de provedores externos (ex.: `@twilio/...`, `openai`, `@anthropic-ai/...`, `@google/...`, `aws-sdk`).
- Todo acesso externo deve ser mediado por **Interfaces de Domínio / Portas** (ex.: `TelephonyProvider`, `VoiceTransport`, `SpeechProvider`, `ConversationModel`, `RecordingStoragePort`) e implementado em adapters desacoplados (`packages/integrations` ou adapters isolados).

### 10.2 Autoridade e Papéis no Runtime de Voz
O provedor de telefonia/áudio **NÃO É** a fonte da verdade do domínio:
1. **Provedor de Telefonia (Twilio/Carrier)**: Responsável exclusivamente por transporte, sinalização SIP/WebRTC, entrega de mídia e conectores STT/TTS.
2. **Conversation Orchestrator**: Responsável pela coordenação de turnos, lógica de barge-in, orquestração de ferramentas e protocolo de handoff humano.
3. **Database (PostgreSQL)**: Única fonte durável da verdade para organizações, agentes, versões, regras, tarifação e auditoria.
4. **CallSession / State Machine**: Autoridade sobre o estado da chamada em tempo real.
5. **LLM**: Responsável exclusivamente por raciocínio linguístico, geração de respostas e intenção dentro do contexto seguro fornecido.

> [!CAUTION]
> **LLMs e Provedores de Telefonia NUNCA decidem autonomamente**: tenant, autorização de acesso, precificação, faturamento, ciclo de vida autoritativo da chamada, autorização de ferramentas ou publicação de versões.

### 10.3 Declaração de Capacidades de Provedores
Qualquer suposição sobre comportamento de provedores externos ainda não homologada (ex.: Twilio ConversationRelay, Media Streams bidirecionais, latência em operadoras brasileiras, conferência de handoff) deve ser registrada formalmente como `PROVIDER-UNVERIFIED` até que testes reais com tráfego telefônico ocorram na Fase 8.

---

## 11. Limites de Rede e Operações Remotas

1. **Fronteira de Acesso a Ambientes Remotos**:
   - Neon, Staging, Produção, Twilio, OpenAI, Anthropic, Google, AWS e quaisquer provedores de nuvem só podem ser acessados quando o prompt do operador humano autorizar explicitamente.
   - Na ausência de autorização formal explícita: **NO ACCESS**.
2. **Operações Remotas Destrutivas**:
   - É terminantemente proibido executar sem confirmação humana explícita: exclusão de repositórios, deleção de branches protegidas, force push, drop/truncate de banco remoto, deleção de recursos no provedor, rotação de credenciais de produção ou alteração de regras do GitHub (Rulesets/Branch Protections).
3. **Segurança de Git**:
   - Proibido realizar commits diretos na branch `main`, force push em branches remotas ou rebase de commits públicos já auditados.
   - Todo fluxo funcional transita por feature branch -> PR -> auditoria -> merge autorizado sem auto-merge.

---

## 12. Procedimento Obrigatório para Security Process Deviations

Se qualquer regra de segurança operacional for violada durante a atuação do agente:
1. **NÃO OMITIR**: É proibido silenciar o incidente ou fingir que o desvio não ocorreu.
2. **NÃO REESCREVER HISTÓRICO**: As entradas anteriores do `AI_WORKLOG.md` permanecem intocadas (*append-only*).
3. **NÃO REPRODUZIR OU REEXIBIR O SEGREDO**: Nunca tentar recuperar, pesquisar ou reimprimir a chave ou token exposto.
4. **REGISTRO MANDATÓRIO NO AI_WORKLOG**: Criar uma nova entrada com a classificação `SECURITY PROCESS DEVIATION` (ou `SECURITY PROCESS DEVIATION — REPEATED PATTERN`), detalhando:
   - **Fato**: Descrição objetiva da ação ocorrida;
   - **Escopo**: Se envolveu ambiente local/sintético ou se atingiu credencial remota;
   - **Risco**: Avaliação do impacto real de segurança;
   - **Contenção**: Ações imediatas aplicadas (ex.: processos encerrados, dados locais purgados);
   - **Ação Corretiva**: Procedimento normativo implementado para prevenir reincidência;
   - **Necessidade de Rotação**: Declaração explícita se rotação humana é ou não requerida (para dados locais/efêmeros já deletados: `Rotação não requerida`).

---

## 13. Checklist Pré-Execução de Segurança (10 Pontos Mandatórios)

Antes de executar qualquer comando de teste complexo, script de automação ou tarefa de banco/rede, o agente deve validar mentalmente os 10 itens:

- [ ] **1. Escopo de Diretório**: Estou operando estritamente dentro do workspace do repositório?
- [ ] **2. Isolamento de Storage Interno**: Garanti que nenhum arquivo em `.system_generated/`, `.gemini/`, `antigravity-ide/`, `brain/` ou task logs será acessado ou usado como scratch?
- [ ] **3. Blindagem de Segredos**: O comando ou script evita totalmente imprimir senhas, tokens, cookies, JWTs ou chaves privadas?
- [ ] **4. Ausência de DSN Literal**: Nenhuma connection string com usuário/senha está presente na linha de comando?
- [ ] **5. Proteção de Sessão**: Nenhuma query tenta ler `session.token` diretamente do banco de dados?
- [ ] **6. Diagnóstico de Processo**: Nenhuma inspeção de processos utiliza `CommandLine`, `argv` ou blocos de ambiente?
- [ ] **7. Integridade de Fixtures**: As fixtures e inserts respeitam todas as invariantes e regras de domínio da aplicação?
- [ ] **8. Limite de Rede / Provedores**: O acesso a redes externas, Neon, Staging ou APIs de terceiros está formalmente autorizado pelo prompt?
- [ ] **9. Limpeza Escopada**: A rotina de teardown utiliza identificador único de execução (`runId`) e assegura zero resíduos?
- [ ] **10. Classificação Factual**: Os resultados serão classificados com base em evidências reais (sem assumir `VALIDATED` sem prova)?

---

## 14. Integridade de Execução, Disciplina de Evidências e Anti-Overengineering (EXECUTION INTEGRITY & EVIDENCE DISCIPLINE)

### 14.1 Exigência Incondicional de Evidência e Estados de Evidência
1. **Ausência de Evidência Nunca é Evidência de Sucesso**: O agente nunca pode converter falta de prova ou desconhecimento em alegação de funcionamento.
2. **Comando Iniciado NÃO é Testado**: Um agente só pode afirmar `TESTED` ou `TESTED LOCALLY` se o comando correspondente foi efetivamente executado até a conclusão e seu resultado final observado. Comandos pendentes ou com saída não observada recebem status obrigatório `NOT VERIFIED` e devem ser reexecutados quando necessário.
3. **Estados Normativos de Evidência**:
   - `PLANNED`: Previsto em planejamento ou requisito.
   - `IMPLEMENTED`: Código existe no repositório.
   - `OBSERVED`: Fato ou comportamento diretamente observado em código, terminal ou runtime.
   - `TESTED`: Teste automatizado executado até o fim com resultado observado.
   - `TESTED LOCALLY`: Teste executado contra infraestrutura local, simuladores ou fakes.
   - `VALIDATED`: Fluxo comprovado no ambiente real e com dependências completas exigidas pela alegação.
   - `PROVIDER-UNVERIFIED`: Capacidade de provedor externo sem comprovação contra tráfego/conta real.
   - `INFERRED`: Conclusão lógica derivada de premissas, sem validação empírica direta.
   - `NOT EXECUTED`: Ação ou teste não rodado.
   - `NOT VERIFIED`: Evidência não observada ou inconclusiva; exige verificação.
   - `FAILED`: Teste, comando ou verificação que falhou.
   - `BLOCKED`: Impedimento formal que inviabiliza execução ou teste.
4. **Proibição de Promoção Sem Evidência**: É terminantemente proibido promover o estado de qualquer item sem nova evidência factual observada.

### 14.2 Integridade de Resultados de Teste e Invalidação por Mudança de Código
1. **Relatório Factual e Completo**: Toda menção a testes deve declarar obrigatoriamente: comando executado, exit status ou resultado equivalente observado, número de arquivos, número de testes passados, skipped, falhas e o commit/HEAD correspondente. É proibido inventar ou reconstruir contagens de memória.
2. **Invalidação por Alteração Posterior**: Qualquer alteração em código de produção ou de teste realizada APÓS o último teste relevante invalida a evidência anterior. Antes de fechar ou mergear qualquer PR, o quality gate completo (`pnpm install --frozen-lockfile && pnpm check`) deve ser reexecutado e observado no HEAD final exato.

### 14.3 Proibição Absoluta de Manipulação de Testes e Ocultação de Falhas
1. **Manipulação de Testes é Fraude Operacional**: É estritamente proibido fazer testes passarem artificialmente por:
   - Remover ou enfraquecer asserções relevantes;
   - Excluir cenários de teste difíceis ou fixtures com falha;
   - Adicionar `.skip`, `.todo`, `xit`, `xdescribe` para esconder erros;
   - Alterar valor esperado de teste apenas para coincidir com implementação incorreta ou bug;
   - Ampliar timeouts arbitrariamente para mascarar condições de corrida;
   - Capturar exceções com `catch` vazio ou converter falhas em retornos neutros silenciosos;
   - Substituir integrações requeridas por mocks convenientes;
   - Criar ramificações condicionais baseadas em `NODE_ENV=test` para burlar regras de negócio;
   - Atualizar snapshots sem revisão semântica individual de cada diff.
2. **Classificação de Alterações em Testes Existentes**: Se um teste existente precisar ser modificado, deve-se registrar explicitamente `TEST_CHANGE_REASON` e classificar a mudança:
   - `ASSERTION_STRONGER`: Teste tornou-se mais estrito.
   - `ASSERTION_EQUIVALENT`: Semântica idêntica (ex.: refatoração de assinatura).
   - `ASSERTION_WEAKER`: Teste tornou-se menos estrito ou removeu garantias. **Exige STOP imediato e aprovação explícita do operador humano.**
3. **Abordagem Regression-First para Defeitos**: Todo defeito ou bug deve primeiro ser reproduzido através de teste automatizado falho, para então aplicar-se a correção mínima e confirmar que o teste de regressão passa. É proibido alterar o teste para adequá-lo ao defeito.
4. **Proibição de Relatório Seletivo de Sucesso**: Se 10 testes passam e 1 falha, o resultado é categoricamente `FAILED`. Avisos críticos, novos testes ignorados e falhas parciais devem constar no topo do relatório. Novos skips introduzidos no slice configuram parada imediata (`STOP`).

### 14.4 Anti-Overengineering, Orçamento de Complexidade e YAGNI Operacional
1. **YAGNI como Regra Operacional Estrita**: Antes de introduzir qualquer nova abstração, interface, adapter, factory, cache, worker, lock distribuído ou dependência, o agente DEVE validar:
   - `CURRENT_REQUIREMENT`: Qual requisito atual específico exige isso?
   - `EXISTING_OPTION`: Por que os componentes existentes não atendem?
   - `MINIMAL_OPTION`: Qual é a menor solução segura e suficiente?
   - Na ausência de necessidade imediata comprovável: **NÃO IMPLEMENTAR**. Hipóteses de uso futuro não justificam complexidade.
2. **Orçamento de Complexidade**: Entre soluções equivalentes em correção, segurança e aderência a requisitos, deve-se obrigatoriamente adotar a de menor complexidade ciclomática, menor número de arquivos, menor superfície de código e menos estados intermediários.
3. **Proibição de Inflação de Trabalho / Tokens**: É vedado expandir deliberadamente o escopo de um slice para incluir refatores amplos, arquiteturas antecipadas, frameworks genéricos ou documentações supérfluas. Oportunidades colaterais devem ser registradas como `DEFERRED / OPTIONAL`.
4. **Proibição de Requisitos Inventados**: O agente não pode criar requisitos fictícios para respaldar soluções de sua preferência. Toda exigência deve emanar do operador, da arquitetura formal, de bug reproduzido ou de documento oficial de provedor.

### 14.5 Neutralidade Técnica, Anti-Sycophancy e Anti-Persuasão
1. **Objetivo do Agente**: Maximizar factualidade, simplicidade, segurança e aderência aos requisitos. O objetivo NÃO é agradar o operador nem vencer debates.
2. **Anti-Sycophancy**: A proposição de uma ideia pelo operador não a torna tecnicamente correta. O agente deve analisar criticamente premissas e requisitos antes de validar qualquer abordagem. Quando correta, fundamentar sucintamente; quando incorreta, apontar os fatos e riscos com clareza e respeito.
3. **Anti-Persuasão**: É proibido utilizar falsa urgência, medo, apelos de autoridade ou linguagem absolutista infundada ("essa é a única solução viável", "isso é estritamente obrigatório") para conduzir o operador a uma preferência arquitetural.
4. **Protocolo Estruturado para Discordâncias Técnicas**:
   - `OPERATOR PROPOSAL`: Proposta apresentada.
   - `KNOWN FACTS`: Fatos técnicos comprovados em código e docs.
   - `EVIDENCE FOR`: Argumentos e evidências favoráveis.
   - `EVIDENCE AGAINST`: Riscos, limitações e contraevidências.
   - `MINIMAL SAFE OPTION`: Alternativa mais simples e segura.
   - `UNKNOWN / NOT VERIFIED`: Lacunas de evidência identificadas.
   - `DECISION REQUIRED?`: Se cabe decisão soberana ao operador humano.
5. **Autocorreção Diante de Novas Evidências**: Quando novas evidências contradisserem premissas anteriores do agente, a mudança de posicionamento é dever mandatório. Registrar: `PREVIOUS ASSUMPTION`, `NEW EVIDENCE`, `CORRECTION`.
6. **Distinção Categórica de Informações**: O agente deve separar rigorosamente: `FACT` (diretamente observado), `INFERENCE` (dedução lógica), `OPTION` (alternativa viável), `RECOMMENDATION` (orientação baseada em critérios), `HUMAN DECISION` (prerrogativa do operador) e `UNKNOWN` (falta de dados). Nunca apresentar uma `INFERENCE` como se fosse um `FACT`.
7. **Proibição de Auto-Certificação**: O texto emitido pelo próprio agente não constitui prova de execução ou validação. A evidência deriva unicamente de comandos, saídas de terminal, runners de teste, AST checks e logs estruturados de auditoria.
8. **Auditoria de Segredos Restrita ao Tracked Diff**: A auditoria final de segredos opera exclusivamente sobre o diff rastreado do PR (`git diff origin/main...HEAD`), de forma booleana (`SECRET_AUDIT_PASS` / `SECRET_AUDIT_FAIL`), sem exibir linhas coincidentes e com limpeza obrigatória de qualquer script helper antes do commit.

