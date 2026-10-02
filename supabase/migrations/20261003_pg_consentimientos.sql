-- Historial de permisos de cada persona (consentimientos).
-- Ejecutar una vez en Supabase → SQL Editor (proyecto mceiutonddbgddrrrajv).
--
-- Cada vez que alguien da o retira un permiso se AGREGA una fila: nunca se
-- modifica ni se borra, así queda la prueba de qué aceptó, con qué texto y cuándo.
-- El estado vigente de un permiso es la fila más reciente de ese tipo.

create table if not exists public.pg_consentimientos (
    id          bigint generated always as identity primary key,
    user_id     uuid not null references auth.users (id) on delete cascade,
    tipo        text not null check (tipo in ('trabajos_ia', 'recomendar_ofertas', 'compartir_cv', 'mensajes', 'mostrar_tests')),
    aceptado    boolean not null,
    version     text not null,              -- versión del texto mostrado, p. ej. 'trabajos_ia_v1'
    texto       text not null,              -- texto exacto que vio la persona
    origen      text,                       -- pantalla donde lo dio, p. ej. 'test-ci'
    created_at  timestamptz not null default now()
);

create index if not exists pg_consentimientos_user_idx on public.pg_consentimientos (user_id, tipo, created_at desc);

alter table public.pg_consentimientos enable row level security;

drop policy if exists "usuario ve sus permisos" on public.pg_consentimientos;
create policy "usuario ve sus permisos" on public.pg_consentimientos
    for select to authenticated using (auth.uid() = user_id);

drop policy if exists "usuario registra sus permisos" on public.pg_consentimientos;
create policy "usuario registra sus permisos" on public.pg_consentimientos
    for insert to authenticated with check (auth.uid() = user_id);

-- Vista para el equipo (se consulta desde el panel de Supabase): personas con el
-- permiso de trabajos de IA vigente y su último resultado del test de CI.
-- Solo cuenta el último registro de cada persona: si aceptó y después retiró, no aparece.
create or replace view public.pg_candidatos_ia
with (security_invoker = true) as
with ultimo as (
    select distinct on (user_id) user_id, aceptado, created_at
    from public.pg_consentimientos
    where tipo = 'trabajos_ia'
    order by user_id, created_at desc
)
select
    u.user_id,
    k.nombre,
    k.email,
    k.telefono,
    k.profesion,
    u.created_at as acepto_el,
    r.puntaje as aciertos_ci,
    (r.detalle ->> 'ci_estimado')::int as ci_estimado,
    r.created_at as test_el
from ultimo u
left join public.pg_candidatos k on k.user_id = u.user_id
left join lateral (
    select puntaje, detalle, created_at from public.pg_resultados_test t
    where t.user_id = u.user_id and t.test = 'ci'
    order by t.created_at desc limit 1
) r on true
where u.aceptado
order by ci_estimado desc nulls last;
