# Callangos

Aplicativo de gestão de ligações: discagem, histórico, gravações, painel analítico, telefonia, API e configurações.

## Estrutura

- `apps/web`: painel de gestão em React.
- `apps/extension`: discador compacto para Chrome/Edge.
- `services/api`: API Fastify e persistência PostgreSQL.
- `services/api/migrations`: esquema versionado do banco.
- `tools/callangos-connector`: conector automático do MicroSIP para eventos e gravações.

## Desenvolvimento local

O ambiente local usa PGlite, um PostgreSQL embutido. Docker não é obrigatório.

```bash
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev:api
pnpm dev:web
pnpm dev:extension
```

Endereços padrão:

- App: `http://localhost:5173`
- Extensão em desenvolvimento: `http://localhost:5174`
- API: `http://localhost:3333`
- Saúde da API: `http://localhost:3333/health`

## Como a discagem funciona

O app web é o discador principal. Ele registra a operação e entrega o número ao softphone configurado no Windows. A extensão é opcional e serve apenas para iniciar chamadas a partir de outros sistemas. Para ativar essa entrega, use:

```env
VITE_DIALER_MODE=external
VITE_API_URL=https://call-api.nathanquiem.com.br
```

O app ou a extensão cria o registro na API antes de abrir o protocolo escolhido em **Telefonia** (`tel:`, `callto:` ou `sip:`). A voz continua no softphone/BR DID; não passa pelo navegador nem pela VPS.

## PostgreSQL na Coolify

Em produção, defina no serviço da API:

```env
DATABASE_URL=postgresql://usuario:senha@postgres:5432/callangos
APP_ORIGIN=https://call.nathanquiem.com.br
HOST=0.0.0.0
PORT=3333
ALLOW_DEV_AUTH_BYPASS=false
ADMIN_EMAIL=seu-email@dominio.com
ADMIN_PASSWORD=uma-senha-forte
WEBHOOK_SIGNING_KEY=uma-chave-aleatoria-com-pelo-menos-32-caracteres
```

Sem `DATABASE_URL`, a API usa `.data/callangos` apenas para desenvolvimento local.

As migrações ficam em `services/api/migrations`. A API executa migrações e a carga inicial automaticamente ao iniciar; `schema_migrations` impede repetições. Para rodar manualmente ou conferir a instalação:

```bash
pnpm db:migrate
pnpm db:seed
```

Não rode os arquivos SQL individualmente se esses comandos estiverem disponíveis.

No serviço web e na compilação da extensão, use:

```env
VITE_API_URL=https://call-api.nathanquiem.com.br
VITE_DIALER_MODE=external
```

Antes de empacotar a extensão para produção, inclua o domínio real da API em `apps/extension/public/manifest.json`, em `host_permissions`. Durante o primeiro teste, o discador da tela principal já funciona sem depender da extensão.

As credenciais SIP da BR DID — servidor, usuário/ramal e senha — são configuradas no softphone. A senha SIP não vai para o banco nem para o frontend. Se a BR DID fornecer API, webhook ou acesso aos CDRs/gravações, essas credenciais serão adicionadas como segredo no serviço da API no Coolify depois do teste do plano.

Em desenvolvimento, `ALLOW_DEV_AUTH_BYPASS=true` mantém a sessão local automática. Ao publicar, use `false`: o app exibirá a tela de login e usará as credenciais administrativas configuradas nas variáveis acima. Novos operadores são criados pelo perfil do administrador e recebem uma senha temporária mostrada uma única vez.

## Deploy na Coolify

Crie duas aplicações usando este mesmo repositório e a branch `main`.

### API

- Build Pack: `Dockerfile`
- Dockerfile: `/services/api/Dockerfile`
- Contexto de build: `/`
- Porta: `3333`
- Domínio: `https://call-api.nathanquiem.com.br`
- Healthcheck: `/health`

Variáveis obrigatórias em produção:

```env
DATABASE_URL=URL_INTERNA_DO_POSTGRESQL_DA_COOLIFY
APP_ORIGIN=https://call.nathanquiem.com.br
ADMIN_EMAIL=seu-email@dominio.com
ADMIN_PASSWORD=uma-senha-forte-com-12-ou-mais-caracteres
WEBHOOK_SIGNING_KEY=uma-chave-aleatoria-com-32-ou-mais-caracteres
ALLOW_DEV_AUTH_BYPASS=false
SEED_DEMO_DATA=false
RECORDINGS_DIR=/data/callangos-recordings
```

Monte um volume persistente da API em `/data/callangos-recordings`. O conector do MicroSIP envia os áudios para esse diretório; sem volume, um novo deploy removeria os arquivos.

A API recusa iniciar em produção quando uma configuração sensível obrigatória estiver ausente ou insegura.

### Interface

- Build Pack: `Dockerfile`
- Dockerfile: `/apps/web/Dockerfile`
- Contexto de build: `/`
- Porta: `80`
- Domínio: `https://call.nathanquiem.com.br`

Cadastre como variáveis disponíveis também durante o build:

```env
VITE_API_URL=https://call-api.nathanquiem.com.br
VITE_DIALER_MODE=external
```

O PostgreSQL permanece privado, sem domínio e sem porta pública. A API deve usar a URL interna fornecida pela Coolify.

## Validação

```bash
pnpm build
pnpm lint
```

- App web: `apps/web/dist`
- Extensão descompactada: `apps/extension/dist`

O plano funcional e o roteiro do teste com a BR DID estão em [`callangos.md`](./callangos.md).
