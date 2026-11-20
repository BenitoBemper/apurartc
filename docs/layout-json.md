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

## XML de NF-e/NFC-e e ZIP
- Aceita `NFe`, `nfeProc` (nota autorizada) e `enviNFe` (lote); `.zip` com vários `.xml` (até 5.000).
- **Papel** pelo CNPJ da empresa selecionada: emitente = **emitida (débito)**; destinatário = **recebida (crédito)**; outro CNPJ = nota rejeitada.
- Cada nota passa pelo validador XSD oficial da calculadora (`/xml/validate?subtipo=nota`).
- Conversão: `dhEmi` → `dhFatoGerador`; `cMunFGIBS`/`cMunFG` → município (UF pelo código IBGE); por item: `NCM`, `qCom`, `uCom`,
  `IBSCBS/CST`, `cClassTrib`, `gIBSCBS/vBC` (sem IS) ou grupo `IS` (com IS); alíquotas `pCBS`, `pIBSUF`, `pIBSMun`, `pIS` só a partir de 2027.
- Valores destacados (`vCBS`, `vIBSUF`, `vIBSMun`, `vIS`) viram `informado` → divergência.
- Eventos (`procEventoNFe`, cancelamento…) são ignorados com aviso. Nota já importada (mesma chave, empresa e papel) é ignorada com aviso.
- No XML/ZIP cada nota é independente: notas com erro são registradas e as demais são calculadas.

## Processamento
1. Layout inválido → importação com **Erro** e lista de erros (`#/campo` em JSON Pointer; em lista, `#/<índice>/campo`).
2. A calculadora rejeitou a operação (HTTP 422) → **Erro** com os códigos dela (ex.: `VAL-001`).
3. Erro em um item (ex.: `REG-011`) não interrompe os demais: o item fica sem valores e o erro é registrado.
4. Limite do plano gratuito: 5.000 notas/mês por escritório.
