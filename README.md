# ApuraRTC

SaaS de validação, cálculo e apuração de IBS/CBS (Reforma Tributária do Consumo).

## Estrutura
| Pasta | Conteúdo |
|---|---|
| `apps/web` | Next.js + TypeScript (interface e API) |
| `apps/worker` | Node + TypeScript (fila de processamento, integração com a calculadora e a API gov) |
| `infra/calculadora` | Dockerfile da calculadora oficial (`../calculadora-rtc-regime-regular`, usada **sem modificação**) |
| `supabase/` | Migrations, RLS e configuração do Supabase |
| `docs/` | Documentação do projeto |

## Rodar tudo localmente
Pré-requisitos: Docker Desktop, Node 22+. A pasta `calculadora-rtc-regime-regular/` precisa estar ao lado de `apurartc/`.

```bash
npm install
npm run calc:up          # calculadora em :8080
npm run db:start         # Supabase local (Studio em :54323)
npm run dev:worker       # consome a fila de importações
npm run dev:web          # app em http://localhost:3000
```
Usuários de teste: veja `supabase/seed.sql`. Os arquivos `.env` locais seguem os `.env.example` (valores de `npx supabase status`).

Testes: `npm test` (unitários + pgTAP) · `npm run test:e2e` (com o worker rodando).
Layout de importação: [docs/layout-json.md](docs/layout-json.md).

## Calculadora local
Pré-requisito: Docker Desktop. A pasta `calculadora-rtc-regime-regular/` precisa estar ao lado de `apurartc/`.

```bash
npm run calc:up
```
API: http://localhost:8080/api · Swagger: http://localhost:8080/api/swagger-ui.html · Health: http://localhost:9101/health
