# Callangos — Plano do piloto

> Revisado em 12/09/2026 para o produto de gestão de ligações.

## 1. Norte do produto

O Callangos é um aplicativo focado em telefonia. Ele existe para:

1. iniciar ligações no computador;
2. registrar cada tentativa;
3. manter um histórico pesquisável;
4. apresentar indicadores operacionais;
5. organizar as gravações disponibilizadas pela operadora;
6. centralizar a configuração da telefonia.

O aplicativo não é CRM e não terá agenda de retorno, funil, contatos comerciais, cadência, tarefas ou gestão de oportunidades neste piloto.

## 2. Arquitetura de navegação

As sete áreas do app são:

### Discador

Tela inicial e ação principal do produto.

- campo para digitar ou colar telefone;
- normalização para o padrão `+55`;
- identificação do número, ramal e estado da operadora;
- escolha do número de saída quando houver mais de uma linha;
- registro da tentativa antes da abertura do softphone;
- acesso às ligações recentes.

O app web é o discador principal. A extensão permanece opcional para capturar números em outros sistemas, sem duplicar a gestão.

### Histórico

Fonte única das chamadas registradas.

- telefone;
- data e hora;
- entrada ou saída;
- estado final;
- duração de sessão e duração falada;
- origem do registro;
- indicação de dado manual ou vindo da operadora;
- período: hoje, ontem, últimos 7 ou 30 dias, esta semana, este mês, personalizado ou todo o período;
- filtros por direção, estado, usuário, número utilizado, número discado e faixas de duração;
- atalho direto para a gravação quando o áudio estiver disponível.

### Gravações

Visão dedicada aos áudios de chamadas.

- telefone e data da chamada;
- duração da gravação;
- exibição exclusiva de áudios com estado `disponível`;
- referência do áudio no provedor;
- reprodução e download somente quando tecnicamente disponíveis.

Pendências continuam visíveis no Histórico, sem criar “áudios fantasma”. No primeiro teste, o áudio pode continuar hospedado na BR DID. O Callangos armazena a relação entre chamada e gravação, não uma promessa de acesso que ainda não foi confirmada.

### Dashboard

Indicadores estritamente telefônicos.

- total de ligações;
- atendidas;
- não atendidas;
- taxa de atendimento;
- tempo falado;
- gravações disponíveis;
- os mesmos filtros detalhados do Histórico;
- gráfico em linha alternável entre ligações, atendidas, minutos falados e taxa de atendimento;
- distribuição por estado;
- volume e atendimento por faixa horária;
- distribuição por duração;
- desempenho por usuário.

### Telefonia

Estado da integração e checklist operacional.

- operadora ativa;
- plano;
- servidor/registrar SIP, porta e transporte;
- ramal, prefixo de saída e protocolo de discagem;
- origem dos CDRs e endpoint, quando fornecido;
- modo de gravação;
- cadastro, rótulo e ativação de múltiplos números.

Credenciais SIP sensíveis não são persistidas no navegador. A senha fica no softphone.

### API

Integrações do Callangos com outros sistemas.

- geração de tokens mostrados uma única vez e armazenados somente como hash;
- consulta autenticada das ligações;
- criação de webhooks para ligação criada, atualizada, finalizada e gravação disponível;
- assinatura HMAC SHA-256 em cada entrega;
- teste real de entrega e registro do resultado.

### Configurações

Somente opções que mudam o comportamento do discador.

- confirmação antes da chamada;
- abertura dos detalhes ao finalizar;
- código padrão do país;
- identificação de dados manuais;
- tema claro, escuro ou conforme o sistema;
- período padrão de análise, fuso horário e densidade das tabelas;
- notificações e comportamento das gravações.

A administração de usuários fica no perfil, no rodapé do menu. Há um único administrador principal e quantos operadores forem necessários.

## 3. Divisão de responsabilidades

### App web

- discagem principal pelo computador;
- consulta do histórico;
- acompanhamento das gravações;
- dashboard;
- estado da telefonia;
- configurações.

### Extensão opcional

- receber, colar ou digitar um telefone;
- criar a chamada na API;
- entregar o telefone ao softphone padrão do Windows;
- medir o tempo da sessão como dado auxiliar;
- pedir apenas o estado final e uma observação técnica;
- atualizar o registro na API.

### BR DID

- número telefônico;
- ramal SIP;
- PABX hospedado;
- tráfego de voz;
- tarifação;
- CDR, quando acessível;
- gravação, retenção e acesso ao áudio conforme os recursos efetivos do plano.

### API do Callangos

- validar e normalizar telefones;
- persistir chamadas e eventos;
- consolidar dashboard;
- relacionar gravações;
- guardar configurações públicas da telefonia;
- receber uma integração futura com CDR, webhook ou API da operadora.

## 4. Fluxo de uma ligação

```text
Usuário informa telefone no app ou na extensão
        |
        v
Interface cria chamada na API
        |
        v
API persiste estado "created"
        |
        v
Interface marca "handed_off"
        |
        v
Windows abre tel:+55... no softphone
        |
        v
BR DID realiza a chamada
        |
        v
Usuário informa o estado final
        |
        v
API salva duração, observação e evento
        |
        v
Gravação fica "pending" até sincronização
```

A voz não passa pela extensão, pelo app ou pela VPS neste piloto. Portanto, não há Asterisk, WebRTC próprio nem portas SIP/RTP na VPS.

## 5. Estados de chamada

| Estado técnico | Uso |
| --- | --- |
| `created` | registro criado na API |
| `handed_off` | telefone entregue ao discador externo |
| `ringing` | toque confirmado por integração futura |
| `answered` | atendimento confirmado por integração futura |
| `completed` | chamada atendida e encerrada |
| `missed` | sem atendimento |
| `busy` | destino ocupado |
| `voicemail` | caixa postal |
| `failed` | falha técnica |
| `canceled` | cancelada antes da conclusão |

Cada mudança gera um evento separado para auditoria.

## 6. Banco de dados

O banco adotado é PostgreSQL.

No desenvolvimento, a API usa PGlite em `.data/callangos`. Na Coolify, a mesma aplicação usa PostgreSQL convencional por `DATABASE_URL`.

### `users`

- identidade do usuário;
- e-mail;
- papel `admin` ou `operator`;
- datas de criação e atualização.
- estado ativo e hash da senha.

### `auth_sessions`

- sessão autenticada;
- expiração e última utilização;
- token armazenado somente como hash.

### `telephony_providers`

- código da operadora;
- nome de exibição;
- estado da conexão;
- modo de integração;
- configuração pública em JSON;
- data da última sincronização.

### `phone_numbers`

- número E.164;
- número formatado;
- rótulo;
- suporte a entrada e saída;
- estado ativo.

### `extensions`

- usuário;
- operadora;
- identificação do ramal;
- modo de discagem;
- estado ativo.

### `calls`

- usuário, operadora, ramal e número local;
- direção;
- telefone remoto normalizado e formatado;
- estado;
- origem `app`, `extension`, `provider_sync` ou `inbound`;
- ID externo da operadora;
- causa de encerramento;
- observação técnica;
- início, atendimento e término;
- duração de toque, conversa e sessão;
- fonte do dado `manual`, `provider` ou `mixed`;
- payload bruto opcional da operadora.

### `call_events`

- chamada;
- tipo do evento;
- origem;
- data e hora;
- payload técnico.

### `recordings`

- chamada e operadora;
- ID externo;
- estado;
- estratégia de armazenamento;
- duração e formato;
- referência do provedor;
- data de gravação e expiração.

### `user_settings`

- confirmação de discagem;
- abertura automática dos detalhes;
- código do país;
- indicação de dado manual;
- tema, densidade, notificações, reprodução automática, período padrão e fuso horário.

### `api_tokens`

- nome, prefixo visível e hash do token;
- estado, validade e última utilização.

### `webhooks` e `webhook_deliveries`

- URL e eventos inscritos;
- estado de cada tentativa, código HTTP e resposta resumida;
- payload e assinatura HMAC derivados da chave privada do servidor.

### `provider_sync_runs`

- execução de sincronização;
- resultado;
- chamadas e gravações importadas;
- mensagem de erro.

## 7. API implementada

| Método | Rota | Finalidade |
| --- | --- | --- |
| `GET` | `/health` | saúde da API e tipo do banco |
| `GET` | `/api/v1/calls` | listar e filtrar ligações |
| `POST` | `/api/v1/calls` | iniciar um registro de chamada |
| `GET` | `/api/v1/calls/:id` | chamada, eventos e gravações |
| `PATCH` | `/api/v1/calls/:id` | atualizar estado e durações |
| `GET` | `/api/v1/dashboard` | indicadores consolidados |
| `GET` | `/api/v1/recordings` | listar somente gravações disponíveis |
| `GET` | `/api/v1/telephony` | estado da telefonia |
| `PATCH` | `/api/v1/telephony` | atualizar configuração pública |
| `POST/PATCH` | `/api/v1/phone-numbers` | cadastrar e ativar linhas |
| `GET` | `/api/v1/settings` | consultar preferências |
| `PATCH` | `/api/v1/settings` | salvar preferências |
| `POST` | `/api/v1/auth/login` | criar uma sessão |
| `GET/POST/PATCH` | `/api/v1/users` | administrar operadores |
| `GET/POST/DELETE` | `/api/v1/api-tokens` | administrar tokens |
| `GET` | `/api/v1/external/calls` | consulta autenticada por token |
| `GET/POST/PATCH/DELETE` | `/api/v1/webhooks` | administrar webhooks |
| `POST` | `/api/v1/webhooks/:id/test` | testar entrega assinada |

## 8. Estratégia de gravação

Gravação é um recurso da telefonia, não do navegador.

O comportamento inicial é:

1. chamada atendida ou caixa postal é finalizada;
2. o Callangos cria uma gravação com estado `pending`;
3. verificamos no painel da BR DID se a gravação existe;
4. se a BR DID oferecer API ou webhook, criamos sincronização automática;
5. se não oferecer, mantemos acesso pelo portal e podemos importar manualmente a referência;
6. somente depois de confirmar URL, autenticação e retenção habilitamos reprodução e download reais.

Esse desenho permite testar a telefonia sem bloquear o restante do produto.

## 9. Teste com a BR DID

### Antes da compra

- confirmar que o produto no carrinho é o PABX Virtual com um ramal;
- confirmar que o número virtual duplicado não permaneceu no carrinho;
- confirmar se chamadas de saída consomem o pacote de 100 minutos;
- confirmar onde as gravações aparecem no painel;
- perguntar se existe API, webhook ou exportação de CDR e gravações.

### Depois da ativação

1. anotar servidor SIP, usuário do ramal, senha e transporte;
2. manter as credenciais apenas no softphone ou no backend;
3. instalar o aplicativo oficial indicado ou MicroSIP;
4. registrar o ramal 2001;
5. fazer uma ligação diretamente pelo softphone;
6. confirmar áudio nos dois sentidos e identificação de chamada;
7. confirmar o lançamento do CDR no painel;
8. confirmar se houve gravação;
9. configurar o softphone como manipulador de links `tel:` no Windows;
10. gerar o app com `VITE_DIALER_MODE=external`;
11. fazer uma chamada pelo app e, opcionalmente, pela extensão;
12. conferir criação, atualização, eventos e gravação pendente no Callangos;
13. comparar horário, duração e estado com o painel da BR DID.

### Critério de aprovação

O piloto está funcional quando:

- o app abre o softphone com o número correto;
- a chamada é completada pela BR DID;
- o histórico recebe o registro;
- o estado final e a duração são salvos;
- o dashboard reflete a nova chamada;
- o painel da BR DID mostra o CDR;
- o comportamento de gravação fica conhecido, mesmo que o acesso continue manual.

## 10. Publicação na Coolify

### Serviços necessários

- aplicação web estática;
- API Node/Fastify;
- PostgreSQL interno.

### Variáveis da API

```env
DATABASE_URL=postgresql://usuario:senha@postgres:5432/callangos
APP_ORIGIN=https://app.seu-dominio.com
HOST=0.0.0.0
PORT=3333
ALLOW_DEV_AUTH_BYPASS=false
ADMIN_EMAIL=seu-email@dominio.com
ADMIN_PASSWORD=uma-senha-forte
WEBHOOK_SIGNING_KEY=uma-chave-aleatoria-com-pelo-menos-32-caracteres
```

### Variáveis dos frontends

```env
VITE_API_URL=https://api.seu-dominio.com
VITE_DIALER_MODE=external
```

### Rede

- publicar app e API apenas por HTTPS no proxy da Coolify;
- não publicar a porta do PostgreSQL na internet;
- não abrir portas SIP ou RTP;
- permitir a origem do app e da extensão na API;
- configurar backup diário do PostgreSQL.

Para o volume inicial de um ou dois usuários, a VPS atual pode compartilhar recursos com outros serviços, desde que haja memória, CPU e armazenamento disponíveis. O Callangos não processará mídia, então a carga inicial tende a ser pequena.

## 11. Segurança antes de produção

O backend já possui sessão, separação entre administrador e operador, tokens com hash e webhooks assinados. Antes de publicar:

- desativar obrigatoriamente `ALLOW_DEV_AUTH_BYPASS`;
- trocar senha inicial e chave de assinatura;
- remover ou isolar dados demonstrativos;
- restringir CORS ao domínio e ao ID definitivo da extensão;
- configurar limites de requisição;
- registrar auditoria de mudanças;
- definir retenção e exclusão de gravações;
- validar consentimento e regras aplicáveis à gravação.

## 12. Situação atual

Concluído:

- arquitetura das sete abas;
- interface web responsiva;
- menu recolhível, fontes refinadas e temas claro/escuro funcionais;
- extensão opcional sem funções comerciais;
- esquema PostgreSQL;
- migração e carga local;
- filtros completos de Histórico e Painel;
- painel com linha alternável, status, horário, duração e usuários;
- suporte a múltiplos números;
- API de chamadas, dashboard, gravações, telefonia, usuários e configurações;
- autenticação, tokens funcionais e webhooks assinados;
- tela de login e gestão de sessão pronta para o deploy;
- registro de eventos;
- criação de gravação pendente após chamada atendida;
- build e teste do ciclo completo local.

Pendente da contratação:

- número real;
- credenciais do ramal;
- confirmação do softphone indicado;
- confirmação prática do protocolo `tel:`;
- CDR real;
- disponibilidade e forma de acesso às gravações;
- decisão sobre integração automática com a BR DID.
