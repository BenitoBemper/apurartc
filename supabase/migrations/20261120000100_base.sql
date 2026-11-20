-- ApuraRTC — base: extensões, schemas e tipos
-- Convenções (MODELO_DADOS.md): id uuid, criado_em timestamptz, valores numeric(15,2), alíquotas numeric(7,4).

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pgmq;

-- Funções internas (RLS, filas, partições). Não exposto pela API.
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- Partições de itens/resultados_calculo. Sem acesso para anon/authenticated:
-- consultar uma partição direto ignoraria o RLS da tabela-mãe.
create schema if not exists particoes;
revoke all on schema particoes from public;
grant usage on schema particoes to service_role;

create type public.papel_membro as enum ('admin', 'operador', 'leitor');
create type public.origem_importacao as enum ('upload', 'api');
create type public.formato_importacao as enum ('json', 'xml_nfe', 'xml_nfse', 'txt');
create type public.status_importacao as enum ('recebido', 'validando', 'processando', 'concluido', 'erro');
-- Estados retornados pela calculadora (POST /observabilidade/regime-geral)
create type public.estado_item as enum ('CALCULADO', 'CALCULO_SIMULADO', 'INCONSISTENCIA_ENTRADA', 'NAO_IMPLEMENTADO', 'FALHA_TECNICA');
