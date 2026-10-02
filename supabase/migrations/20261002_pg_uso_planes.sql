-- Planes de candidatos y contador de usos de herramientas (escáner ATS, entrevista simulada).
-- Ejecutar una vez en Supabase → SQL Editor (proyecto mceiutonddbgddrrrajv).
--
-- Cuenta gratis: 1 escaneo ATS y 1 entrevista en total. Plan Pro: sin límite.
-- Para dar Pro a alguien (hasta que haya pagos online), en Table Editor → pg_planes:
--   insertar una fila con su user_id, plan = 'pro' y vence = fecha de fin (o vacío).

create table if not exists public.pg_planes (
    user_id     uuid primary key references auth.users (id) on delete cascade,
    plan        text not null check (plan in ('pro', 'enterprise')),
    vence       timestamptz,
    created_at  timestamptz not null default now()
);

create table if not exists public.pg_uso (
    id          bigint generated always as identity primary key,
    user_id     uuid not null references auth.users (id) on delete cascade,
    herramienta text not null check (herramienta in ('ats', 'entrevista')),
    created_at  timestamptz not null default now()
);

create index if not exists pg_uso_user_idx on public.pg_uso (user_id, herramienta, created_at desc);

alter table public.pg_planes enable row level security;
alter table public.pg_uso enable row level security;

-- Planes: cada usuario solo puede ver el suyo. Nadie puede asignarse un plan desde el sitio.
drop policy if exists "usuario ve su plan" on public.pg_planes;
create policy "usuario ve su plan" on public.pg_planes
    for select to authenticated using (auth.uid() = user_id);

-- Usos: cada usuario ve y registra los suyos. No se pueden borrar ni modificar,
-- así nadie puede "devolverse" un uso gratis.
drop policy if exists "usuario ve sus usos" on public.pg_uso;
create policy "usuario ve sus usos" on public.pg_uso
    for select to authenticated using (auth.uid() = user_id);

drop policy if exists "usuario registra sus usos" on public.pg_uso;
create policy "usuario registra sus usos" on public.pg_uso
    for insert to authenticated with check (auth.uid() = user_id);
