# Layout JSON de importação (ApuraRTC)

Base: `OperacaoInput` da calculadora oficial (`calculadora-rtc-regime-regular/docs/exemplos.md`).
O arquivo pode conter **uma operação (nota)** ou **uma lista** de operações (até 5.000 por arquivo).

## Campos obrigatórios
| Campo | Regra |
|---|---|
| `id` | identificador da operação (exigido pela calculadora) |
| `dhFatoGerador` | ISO 8601 **com fuso** (ex.: `2027-03-10T10:00:00-03:00`). Define a competência (mês, fuso de Brasília) |
| `municipio` | código IBGE (7 dígitos) |
| `uf` | 2 letras maiúsculas |
| `itens[]` | ao menos 1; `numero` único; `cst` (3 dígitos), `cClassTrib` (6 dígitos), `ncm` (8) **ou** `nbs` (9) |

`versao` é opcional (padrão `1.0.0`). Os demais campos do `OperacaoInput` (`aliquotasNominais`, `impostoSeletivo`,
`tributacaoRegular`, `gComponentesBC`, `gCompraGov`, `tpDoc`…) são repassados à calculadora como estão.

## Campos extras do ApuraRTC (opcionais; não vão para a calculadora)
| Onde | Campo | Uso |
|---|---|---|
| operação | `chaveAcesso` (44 dígitos), `numero`, `serie`, `tipoDfe` | identificação da nota |
| item | `informado: { cbs, ibsUf, ibsMun, is }` | valores do ERP → divergência = calculado − informado |

## Processamento
1. Layout inválido → importação com **Erro** e lista de erros (`#/campo` em JSON Pointer; em lista, `#/<índice>/campo`).
2. A calculadora rejeitou a operação (HTTP 422) → **Erro** com os códigos dela (ex.: `VAL-001`).
3. Erro em um item (ex.: `REG-011`) não interrompe os demais: o item fica sem valores e o erro é registrado.
4. Limite do plano gratuito: 5.000 notas/mês por escritório.
