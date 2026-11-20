-- ApuraRTC — testes de RLS, fila e regras do modelo (pgTAP). Rodar: npx supabase test db
-- Usa os usuários/escritórios do seed.sql.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

-- Isola dos dados criados pelo app e pelo e2e (o rollback no fim desfaz tudo).
delete from public.importacoes;
do $$ begin perform pgmq.purge_queue('importacoes'); end $$;

-- ---------- Fixtures (como postgres, dono das tabelas) ----------
insert into public.importacoes (id, empresa_id, formato, arquivo_path, hash_sha256) values
  ('10000000-0000-0000-0000-0000000000a1', 'c0000000-0000-0000-0000-0000000000a1', 'json', 'x/a1.json', repeat('a', 64)),
  ('10000000-0000-0000-0000-0000000000a2', 'c0000000-0000-0000-0000-0000000000a2', 'json', 'x/a2.json', repeat('b', 64)),
  ('10000000-0000-0000-0000-0000000000b1', 'c0000000-0000-0000-0000-0000000000b1', 'json', 'x/b1.json', repeat('c', 64));

-- Emitida em 31/03/2027 23:30 (Brasília) = 01/04 em UTC → a competência deve ser março.
insert into public.documentos (id, escritorio_id, empresa_id, importacao_id, tipo_dfe, dh_emissao) values
  ('20000000-0000-0000-0000-0000000000a1', 'e0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-0000000000a1', 'NFE', '2027-03-31T23:30:00-03:00');

insert into public.itens (id, competencia, escritorio_id, empresa_id, documento_id, numero, ncm, cst, cclasstrib, base_calculo, cbs_informado) values
  ('30000000-0000-0000-0000-0000000000a1', '2027-03-01', 'e0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-0000000000a1',
   '20000000-0000-0000-0000-0000000000a1', 1, '10063021', '200', '200003', 100.00, 10.00);

insert into public.resultados_calculo (competencia, escritorio_id, empresa_id, item_id, versao_calculadora, versao_base, estado_item, cbs_aliquota, cbs_valor) values
  ('2027-03-01', 'e0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-0000000000a1',
   '30000000-0000-0000-0000-0000000000a1', '1.6.1', 'V0059', 'CALCULO_SIMULADO', 8.8, 8.80);

-- ---------- Regras do modelo ----------
select is((select escritorio_id from public.importacoes where id = '10000000-0000-0000-0000-0000000000b1'),
  'e0000000-0000-0000-0000-00000000000b'::uuid, 'trigger preenche escritorio_id a partir da empresa');
select is((select count(*)::int from pgmq.q_importacoes), 3, 'cada importação entra na fila pgmq');
select is((select competencia from public.documentos where id = '20000000-0000-0000-0000-0000000000a1'),
  '2027-03-01'::date, 'competência usa o fuso de Brasília (emissão quando não há fato gerador)');
select is((select tableoid::regclass::text from public.itens where id = '30000000-0000-0000-0000-0000000000a1'),
  'particoes.itens_2027_03', 'item gravado na partição do mês');
select throws_ok(
  $$insert into public.importacoes (empresa_id, formato, arquivo_path, hash_sha256)
    values ('c0000000-0000-0000-0000-0000000000a1', 'json', 'x/dup.json', repeat('a', 64))$$,
  '23505', null, 'arquivo duplicado (mesmo hash na empresa) é bloqueado');

-- ---------- admin.a: vê tudo do Escritório A ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is((select count(*)::int from public.empresas), 2, 'admin.a vê as 2 empresas do escritório A');
select is((select count(*)::int from public.importacoes), 2, 'admin.a vê só importações do escritório A');
select is((select count(*)::int from public.itens), 1, 'admin.a vê os itens do escritório A');
select is((select diferenca from public.vw_divergencias where tributo = 'CBS'), -1.20::numeric,
  'vw_divergencias: calculado − informado');
select is((select count(*)::int from public.vw_divergencias where diferenca is not null), 1,
  'vw_divergencias: sem valor informado não há diferença');
select throws_ok($$select count(*) from particoes.itens_2027_03$$, '42501', null,
  'partição não é acessível diretamente');
select lives_ok(
  $$insert into public.empresas (escritorio_id, cnpj, razao_social)
    values ('e0000000-0000-0000-0000-00000000000a', '11222333000181', 'Nova A3') returning id$$,
  'admin.a cadastra empresa com RETURNING (bug da Etapa 3)');

-- ---------- operador.a: restrito à Empresa A1 ----------
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.empresas), 1, 'operador.a vê só a empresa A1');
select is((select count(*)::int from public.importacoes), 1, 'operador.a vê só importações da A1');
select lives_ok(
  $$insert into public.importacoes (empresa_id, formato, arquivo_path, hash_sha256)
    values ('c0000000-0000-0000-0000-0000000000a1', 'json', 'x/op.json', repeat('d', 64))$$,
  'operador.a importa na A1');
select throws_ok(
  $$insert into public.importacoes (empresa_id, formato, arquivo_path, hash_sha256)
    values ('c0000000-0000-0000-0000-0000000000a2', 'json', 'x/op2.json', repeat('e', 64))$$,
  '42501', null, 'operador.a não importa na A2');

-- ---------- leitor.a: só consulta ----------
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.empresas), 3, 'leitor.a vê as 3 empresas (inclui a criada no teste)');
select throws_ok(
  $$insert into public.importacoes (empresa_id, formato, arquivo_path, hash_sha256)
    values ('c0000000-0000-0000-0000-0000000000a1', 'json', 'x/lei.json', repeat('f', 64))$$,
  '42501', null, 'leitor.a não importa');

-- ---------- admin.b: isolado do Escritório A ----------
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is((select count(*)::int from public.empresas), 1, 'admin.b vê só a empresa B1');
select is((select count(*)::int from public.itens), 0, 'admin.b não vê itens do escritório A');
select is((select count(*)::int from public.vw_divergencias), 0, 'admin.b não vê divergências do escritório A');
select lives_ok($$update public.escritorios set nome = 'invadido' where id = 'e0000000-0000-0000-0000-00000000000a'$$,
  'update de admin.b no escritório A não dá erro (RLS filtra 0 linhas)');
select isnt((select public.criar_escritorio('Escritório B2 (teste)')), null, 'criar_escritorio cria e torna admin');

-- ---------- conferência e anon ----------
reset role;
select is((select nome from public.escritorios where id = 'e0000000-0000-0000-0000-00000000000a'),
  'Escritório A (teste)', 'escritório A continua intacto');
set local role anon;
select throws_ok($$select count(*) from public.empresas$$, '42501', null, 'anon não acessa tabelas');

select * from finish();
rollback;
