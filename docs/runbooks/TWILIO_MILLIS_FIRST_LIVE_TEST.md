# Runbook — primeira chamada de teste Twilio + Millis AI (Windows / PowerShell)

> **Estado em 2026-11-11: `BLOCKED` para chamada real.** O código offline existe e é testado (S2, S3, S4, 008-MVP3 e este preflight — DEC-052), mas **nenhuma chamada real está autorizada**. Cada passo que gasta crédito, compra número, expõe webhook ou liga para alguém exige **autorização humana específica e prévia** (bloqueio 9 da 008-OF6), registrada como nova DEC.
>
> Referências: [verificação dos contratos oficiais](../research/PHASE_8_PROVIDER_CONTRACT_VERIFICATION.md) · [desenho SIP](../research/PHASE_8_TWILIO_SIP_MILLIS_ARCHITECTURE_DESIGN.md) · ROADMAP, 008-OF6.

## 0. Regras para quem executa

- Nunca cole chaves, tokens ou senhas em arquivos, prints, chats ou no Git. Use variáveis **da sessão** do PowerShell, digitadas com `Read-Host -AsSecureString`.
- Ligue **somente** para um telefone seu. Uma chamada por vez. Tenha o comando de desligar (seção 5) pronto **antes** de discar.
- Nada aqui ativa clientes, campanhas, webhooks de produção ou o runtime de produção.

## 1. Verificar a máquina (somente leitura)

```powershell
node -v          # exigido: >= 22.12
pnpm -v          # exigido: >= 10
git --version
docker version   # só se for usar banco local descartável
```

Worktree isolada e limpa, na `main` mesclada que contém este runbook:

```powershell
git fetch origin
git worktree add ..\vap-live-test origin/main
cd ..\vap-live-test
git status --porcelain   # deve ficar vazio
pnpm install --frozen-lockfile
pnpm check               # gate canônico; precisa passar antes de qualquer teste
```

Prova offline do fluxo inteiro (sem rede, sem credenciais):

```powershell
pnpm exec vitest run packages/integrations/src/outbound-e2e packages/integrations/src/twilio-outbound packages/integrations/src/millis packages/integrations/src/live-readiness
```

## 2. Opção A — teste direto de compatibilidade Twilio ↔ Millis (sem a plataforma)

**Para que serve:** verificar, antes de ligar o runtime da plataforma, se uma chamada criada pela Twilio para um número +55 consegue fazer `<Dial><Sip>` para o endereço devolvido pela Millis e ter áudio nos dois sentidos em pt-BR.

**Confirma:** alcance SIP Twilio → Millis; áudio bidirecional; latência percebida; qualidade de STT/TTS em pt-BR; **as chaves reais da resposta de `register_sip_call`** (`sip_uri` × `sip`, presença de `session_id`) — evidência útil, mas a confirmação contratual continua sendo da Millis.

**Não confirma:** código da plataforma, callbacks assinados, reconciliação, orçamento, persistência, encerramento pela plataforma, comportamento sob falha.

**Gasta créditos dos dois fornecedores: só execute com autorização específica (DEC nova).**

### 2.1 Consoles (ação do operador)

| Fornecedor | Onde | O que configurar |
| :--- | :--- | :--- |
| Twilio | Console → Phone Numbers | Número brasileiro com o cadastro regulatório (bundle) aprovado. |
| Twilio | Console → Voice → Settings → Geo permissions | Brasil habilitado para chamadas de saída (sem isso: erro 21215). |
| Twilio | Console → Account → API keys & tokens | Uma API Key (SID `SK…` + segredo) só para este teste; revogue ao final. |
| Millis | Painel → Agents | Agente de teste em `pt-BR` (campo `language`), sem funções/ferramentas. Anote o `agent_id`. |
| Millis | Painel → API keys | Chave privada para o cabeçalho `authorization`. |

### 2.2 Variáveis só da sessão

```powershell
function Read-Secret($label) {
  $s = Read-Host $label -AsSecureString
  [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
}
$millisKey = Read-Secret 'MILLIS_API_KEY'
$twSid     = Read-Host 'TWILIO_ACCOUNT_SID (AC...)'
$twKeySid  = Read-Host 'TWILIO_API_KEY_SID (SK...)'
$twKeySec  = Read-Secret 'TWILIO_API_KEY_SECRET'
$from      = Read-Host 'Seu número Twilio +55 (E.164)'
$to        = Read-Host 'SEU telefone +55 (E.164)'
$agentId   = Read-Host 'agent_id da Millis'
```

### 2.3 Registrar a sessão SIP na Millis

Base documentada: `https://api-west.millis.ai` (EUA) ou `https://api-eu-west.millis.ai` (UE).

```powershell
$reg = Invoke-RestMethod -Method Post -Uri 'https://api-west.millis.ai/register_sip_call' `
  -Headers @{ authorization = $millisKey } -ContentType 'application/json' `
  -Body (@{ agent_id = $agentId; metadata = @{ correlation_id = [guid]::NewGuid().ToString() } } | ConvertTo-Json)
$reg.PSObject.Properties.Name   # registre SÓ os nomes das chaves (ex.: call_id, sip_uri/sip, session_id)
$sip = if ($reg.sip_uri) { $reg.sip_uri } else { $reg.sip }
```

Se não vier URI `sip:…`, **pare** e envie a resposta (sem segredos) à Millis — é exatamente a dúvida contratual aberta.

### 2.4 Criar UMA chamada na Twilio para o seu telefone

```powershell
$pair  = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${twKeySid}:${twKeySec}"))
$twiml = "<Response><Dial timeLimit=`"120`" record=`"do-not-record`"><Sip>$sip;region=us1;transport=tls</Sip></Dial></Response>"
$call  = Invoke-RestMethod -Method Post -Uri "https://api.twilio.com/2010-04-01/Accounts/$twSid/Calls.json" `
  -Headers @{ Authorization = "Basic $pair" } `
  -Body @{ To = $to; From = $from; Twiml = $twiml; Timeout = '30'; TimeLimit = '180' }
$call.sid   # CA... — necessário para desligar
```

Teste também `transport=udp` e as regiões `us1` × `br1` **somente** se a primeira tentativa falhar e houver autorização para outra chamada. Anote o `DialSipResponseCode` no Call Log do console.

### 2.5 Encerrar e limpar (sempre)

```powershell
Invoke-RestMethod -Method Post -Uri "https://api.twilio.com/2010-04-01/Accounts/$twSid/Calls/$($call.sid).json" `
  -Headers @{ Authorization = "Basic $pair" } -Body @{ Status = 'completed' }
if ($reg.session_id) {
  Invoke-RestMethod -Method Post -Uri "https://api-west.millis.ai/sessions/$($reg.session_id)/terminate" -Headers @{ authorization = $millisKey }
}
Remove-Variable millisKey, twKeySec, pair -ErrorAction SilentlyContinue
```

Depois: revogue a API Key de teste na Twilio e a chave na Millis se não forem mais usadas.

## 3. Opção B — teste usando o Voice Agent Platform

### 3.1 O que já funciona hoje (offline)

1. Worktree isolada e gate: seção 1.
2. Banco: o teste real exige **staging segregado** (bloqueio 7). Para ensaio local, use um PostgreSQL descartável em contêiner (porta só em `127.0.0.1`) e rode migrations **somente** nesse banco e **somente** com autorização explícita (`pnpm --filter @voice-agent/database db:migrate` com `DATABASE_URL` da sessão).
3. Chaves internas web↔API: geradas em memória (Ed25519) pela composição; nunca grave em disco.
4. Agente: publique uma versão em `pt-BR` no Agent Studio (versões em `es-ES` são recusadas — não existe equivalente no enum de idiomas da Millis). Ferramentas nunca são enviadas à Millis.
5. Preflight (sem rede, sem imprimir valores):

```powershell
$env:APP_ENV = 'staging'
$env:LIVE_TEST_ENABLED = 'false'          # 'true' só no momento autorizado
$env:LIVE_TEST_KILL_SWITCH = 'engaged'    # 'released' só no momento autorizado
# ...demais variáveis da tabela 3.2 (segredos com Read-Secret, seção 2.2)
pnpm preflight:live-test                  # JSON por checagem; código de saída 2 = BLOCKED
```

### 3.2 Variáveis lidas pelo preflight (nomes reais do código)

Definidas em `packages/integrations/src/live-readiness/first-live-call-environment.ts`.

| Variável | Formato aceito | Onde obter |
| :--- | :--- | :--- |
| `APP_ENV` | `staging` | Operador |
| `LIVE_TEST_ENABLED` | `true`/`false` | Operador (padrão `false`) |
| `LIVE_TEST_KILL_SWITCH` | `engaged`/`released` | Operador (padrão `engaged`) |
| `TWILIO_ACCOUNT_SID` | `AC` + 32 hex | Console Twilio |
| `TWILIO_API_KEY_SID` / `TWILIO_API_KEY_SECRET` | `SK` + 32 hex / segredo | Console Twilio → API keys |
| `TWILIO_AUTH_TOKEN` | 32 hex | Console Twilio (valida `X-Twilio-Signature`) |
| `TWILIO_CALLER_ID` | E.164 `+55…` | Número brasileiro Twilio |
| `TWILIO_SIP_REGION` | `us1`, `us2`, `ie1`, `de1`, `sg1`, `jp1`, `br1`, `au1` | Decisão técnica (medição) |
| `LIVE_TEST_CALLBACK_BASE_URL` | `https://` + FQDN, sem barra final | Staging com TLS |
| `MILLIS_API_KEY` | chave privada | Painel Millis |
| `MILLIS_REGION` | `us-west` ou `eu-west` | Decisão técnica |
| `LIVE_TEST_DESTINATION` | E.164 `+55…` | Seu telefone |
| `LIVE_TEST_MAX_DURATION_SECONDS` | 30–600 | Operador |
| `LIVE_TEST_BUDGET_CAP_MINOR_UNITS` | inteiro positivo | Teto aprovado (bloqueio 5) |
| `LIVE_TEST_MAX_CONCURRENCY` | `1` | Fixo |
| `DATABASE_URL` / `LIVE_TEST_EXPECTED_DB_HOST` | DSN / host esperado (não local) | Staging |
| `LIVE_TEST_AUTHORIZATION_REF` | `DEC-NNN` | DEC da autorização da chamada |
| `LIVE_TEST_OPERATOR_ATTESTATIONS` | lista separada por vírgula | Ver abaixo |

Atestações aceitas: `twilio_number_and_regulatory_bundle_approved`, `destination_owned_by_operator`, `budget_cap_approved`, `legal_and_regulatory_review_done`, `staging_tls_fqdn_verified`, `single_call_authorized`. São **declarações humanas**, não verificação automática.

### 3.3 O que ainda NÃO existe (impede os passos de chamada real)

| Peça | Situação | Necessário |
| :--- | :--- | :--- |
| Composição real (transportes com `fetch`, adaptadores S2/S3, orquestrador S4) | `BLOCKED_CODE` | PR própria, desativada por padrão, com autorização |
| Rotas de callback Twilio montadas em staging (`/v1/provider-webhooks/twilio/...`) | `BLOCKED_CODE` (PUBLIC_WEBHOOKS=0) | Autorização de webhook em staging + TLS/FQDN |
| Persistência durável de sessão, hash do token e pernas | `BLOCKED_CODE` | Migration aditiva autorizada |
| Contrato da resposta de `register_sip_call`, validade da sessão, autenticação do webhook Millis | `BLOCKED_PROVIDER` | Resposta escrita da engenharia da Millis |
| Homologação Twilio → `<Dial><Sip>` → Millis em +55 | `BLOCKED_PROVIDER` | Chamado técnico Twilio (ou evidência da Opção A) |
| Política de validade desconhecida da sessão | Padrão `REFUSE` | Decisão D-REG-TIMING ou validade documentada |

Enquanto o preflight disser `BLOCKED`, **não** existe comando de chamada real na plataforma — por desenho.

### 3.4 Quando tudo estiver liberado (sequência futura, após autorização)

1. Preflight retorna `READY_FOR_OPERATOR_CONTROLLED_PROVIDER_VALIDATION` (código 0).
2. Operador registra a DEC específica da chamada (número, créditos, horário, teto).
3. `LIVE_TEST_ENABLED=true` e `LIVE_TEST_KILL_SWITCH=released` só durante a janela autorizada.
4. Uma tentativa, para `LIVE_TEST_DESTINATION`; acompanhar os logs estruturados por `correlationId` e o Call Log da Twilio.
5. Ao final: `LIVE_TEST_KILL_SWITCH=engaged`, encerrar sessão (seção 5), conferir ausência de sessões e chamadas abertas, registrar o relatório sanitizado (sem telefone completo, sem segredos).
6. Só então o resultado pode ser classificado como `PROVIDER_VALIDATED` para aquele fluxo.

## 4. Diagnóstico

| Sintoma | Onde olhar | Leitura provável |
| :--- | :--- | :--- |
| Erro 21215 na criação | Resposta da Calls API | Geo permission do Brasil desligada |
| Erro 21210/21212 | Resposta da Calls API | Número de origem não pertence à conta/não verificado |
| Erro 20003 / HTTP 401 | Resposta da Calls API | API Key/segredo incorretos |
| HTTP 429 (20429) | Resposta da Calls API | Concorrência da API excedida; não foi processado |
| `DialSipResponseCode` 404/480 | Call Log → perna filha | URI SIP inválido ou expirado / Millis indisponível |
| `DialSipResponseCode` 488 | Call Log → perna filha | Codec ou mídia incompatível (perguntar à Millis: codecs/SRTP) |
| `DialSipResponseCode` 403/407 | Call Log → perna filha | Millis exige autenticação SIP/IP (não documentado) |
| Atende e fica mudo | Call Log + call-logs da Millis | Mídia/NAT/codec; testar `transport=udp` com autorização |
| Áudio só de um lado | Call Log | Mídia unidirecional; registrar e enviar aos dois suportes |
| Millis 401 | `register_sip_call` | Formato do cabeçalho `authorization` (dúvida aberta) |

## 5. Interromper imediatamente

1. **Telefonia primeiro:** `Status=completed` na chamada (seção 2.5) ou "Hang up" no Call Log do console Twilio.
2. **Depois a sessão:** `POST /sessions/{session_id}/terminate` na Millis.
3. Conferir: Call Log sem chamada `in-progress`; `GET /call-logs/{session_id}` com status final.
4. Na plataforma: `LIVE_TEST_KILL_SWITCH=engaged` (o portão recusa novas tentativas; o kill switch encerra telefonia e depois sessão).
