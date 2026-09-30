-- Registro de postulantes y resultados de tests de Puentes Globales.
-- Ejecutar una vez en Supabase → SQL Editor (proyecto flsguqlmcqxyulkqmriu).
-- Los datos se consultan desde el panel de Supabase (Table Editor), que ignora RLS.

create table if not exists public.pg_candidatos (
    user_id         uuid primary key references auth.users (id) on delete cascade,
    email           text not null,
    nombre          text not null default '',
    telefono        text,
    profesion       text,
    acepta_contacto boolean not null default false,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create table if not exists public.pg_resultados_test (
    id          bigint generated always as identity primary key,
    user_id     uuid not null references auth.users (id) on delete cascade,
    test        text not null check (test in ('razonamiento', 'numerico', 'idiomas', 'personalidad', 'psicometrico', 'ci')),
    puntaje     numeric not null,
    maximo      numeric not null,
    detalle     jsonb,
    created_at  timestamptz not null default now()
);

create index if not exists pg_resultados_test_user_idx on public.pg_resultados_test (user_id, created_at desc);

alter table public.pg_candidatos enable row level security;
alter table public.pg_resultados_test enable row level security;

-- Cada usuario solo puede ver y editar su propia ficha.
drop policy if exists "candidato ve su ficha" on public.pg_candidatos;
create policy "candidato ve su ficha" on public.pg_candidatos
    for select to authenticated using (auth.uid() = user_id);

drop policy if exists "candidato crea su ficha" on public.pg_candidatos;
create policy "candidato crea su ficha" on public.pg_candidatos
    for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "candidato edita su ficha" on public.pg_candidatos;
create policy "candidato edita su ficha" on public.pg_candidatos
    for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Resultados: el usuario puede insertar y leer los suyos; no puede modificarlos.
drop policy if exists "candidato ve sus resultados" on public.pg_resultados_test;
create policy "candidato ve sus resultados" on public.pg_resultados_test
    for select to authenticated using (auth.uid() = user_id);

drop policy if exists "candidato guarda sus resultados" on public.pg_resultados_test;
create policy "candidato guarda sus resultados" on public.pg_resultados_test
    for insert to authenticated with check (auth.uid() = user_id);
