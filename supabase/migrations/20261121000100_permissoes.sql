-- Permissões explícitas nas tabelas (projetos novos do Supabase não concedem mais automaticamente).
-- O RLS continua decidindo QUAIS linhas; aqui só se define QUE operações cada papel pode tentar.
-- Mínimo necessário para o app (authenticated) e total para o servidor (service_role, que ignora o RLS).

grant select, update                   on public.escritorios        to authenticated;
grant select, insert, update, delete   on public.empresas           to authenticated;
grant select, insert, update, delete   on public.membros            to authenticated;
grant select, insert, delete           on public.membros_empresas   to authenticated;
grant select, insert, update           on public.api_chaves         to authenticated;
grant select, insert                   on public.importacoes        to authenticated;
grant select on public.documentos, public.itens, public.resultados_calculo, public.erros_validacao,
                public.auditoria, public.uso_mensal                  to authenticated;
grant select on public.vw_divergencias, public.vw_totais_mensais    to authenticated;

-- anon (visitante sem login): nada.
revoke all on all tables in schema public from anon;

-- Servidor (API pública, convites, worker via PostgREST)
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Tabelas futuras: o servidor recebe acesso; o app recebe caso a caso, em cada migration.
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
