-- ApuraRTC — dados de TESTE (somente ambiente local: `supabase db reset`).
-- Usuários locais (senha de teste para todos: senha-local-123):
--   admin.a@apurartc.test    → admin do Escritório A
--   operador.a@apurartc.test → operador do Escritório A, restrito à Empresa A1
--   leitor.a@apurartc.test   → leitor do Escritório A (todas as empresas)
--   admin.b@apurartc.test    → admin do Escritório B

do $$
declare
  u record;
begin
  for u in
    select * from (values
      ('a0000000-0000-0000-0000-000000000001'::uuid, 'admin.a@apurartc.test'),
      ('a0000000-0000-0000-0000-000000000002'::uuid, 'operador.a@apurartc.test'),
      ('a0000000-0000-0000-0000-000000000003'::uuid, 'leitor.a@apurartc.test'),
      ('b0000000-0000-0000-0000-000000000001'::uuid, 'admin.b@apurartc.test')
    ) as t (id, email)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
      extensions.crypt('senha-local-123', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), u.id, u.id::text,
            jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
            'email', now(), now(), now());
  end loop;
end $$;

insert into public.escritorios (id, nome, documento) values
  ('e0000000-0000-0000-0000-00000000000a', 'Escritório A (teste)', '11222333000181'),
  ('e0000000-0000-0000-0000-00000000000b', 'Escritório B (teste)', '44555666000190');

insert into public.empresas (id, escritorio_id, cnpj, razao_social, uf, municipio_ibge) values
  ('c0000000-0000-0000-0000-0000000000a1', 'e0000000-0000-0000-0000-00000000000a', '12345678000195', 'Empresa A1 Ltda', 'RS', 4314902),
  ('c0000000-0000-0000-0000-0000000000a2', 'e0000000-0000-0000-0000-00000000000a', '12345678000276', 'Empresa A2 Ltda', 'RS', 4314902),
  ('c0000000-0000-0000-0000-0000000000b1', 'e0000000-0000-0000-0000-00000000000b', '98765432000198', 'Empresa B1 SA',   'MG', 3106200);

insert into public.membros (id, user_id, escritorio_id, papel) values
  ('d0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-00000000000a', 'admin'),
  ('d0000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-00000000000a', 'operador'),
  ('d0000000-0000-0000-0000-0000000000a3', 'a0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-00000000000a', 'leitor'),
  ('d0000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-00000000000b', 'admin');

insert into public.membros_empresas (membro_id, empresa_id, escritorio_id) values
  ('d0000000-0000-0000-0000-0000000000a2', 'c0000000-0000-0000-0000-0000000000a1', 'e0000000-0000-0000-0000-00000000000a');
