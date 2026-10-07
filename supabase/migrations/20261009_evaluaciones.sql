-- Evaluaciones de perfil (por ahora: elegibilidad para visas de trabajo en Europa).
-- Ejecutar una vez en Supabase → SQL Editor, después de las migraciones anteriores.
--
-- La persona escribe sus respuestas; la IA de Alex IO las califica. Si Alex IO todavía no
-- está disponible, la evaluación queda "pendiente" y se completa después.
-- Escribe solo el servidor (clave secreta); cada persona lee las suyas.

create table if not exists public.pg_evaluaciones (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null references auth.users (id) on delete cascade,
    tipo         text not null default 'visa' check (tipo in ('visa')),
    respuestas   jsonb not null,
    estado       text not null default 'pendiente' check (estado in ('pendiente', 'evaluada', 'error')),
    resultado    jsonb,
    puntaje      int check (puntaje between 0 and 100),
    created_at   timestamptz not null default now(),
    evaluada_at  timestamptz,
    constraint pg_evaluaciones_tamano check (octet_length(respuestas::text) < 10000)
);

create index if not exists pg_evaluaciones_user_idx on public.pg_evaluaciones (user_id, created_at desc);
create index if not exists pg_evaluaciones_pendientes_idx on public.pg_evaluaciones (estado) where estado <> 'evaluada';

alter table public.pg_evaluaciones enable row level security;

drop policy if exists "usuario ve sus evaluaciones" on public.pg_evaluaciones;
create policy "usuario ve sus evaluaciones" on public.pg_evaluaciones
    for select to authenticated using (auth.uid() = user_id);
