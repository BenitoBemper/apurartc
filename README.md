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

## Calculadora local
Pré-requisito: Docker Desktop. A pasta `calculadora-rtc-regime-regular/` precisa estar ao lado de `apurartc/`.

```bash
npm run calc:up
```
API: http://localhost:8080/api · Swagger: http://localhost:8080/api/swagger-ui.html · Health: http://localhost:9101/health
