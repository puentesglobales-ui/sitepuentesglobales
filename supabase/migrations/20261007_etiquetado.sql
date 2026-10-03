-- Base aparte para el proyecto de etiquetado de IA.
-- Ejecutar una vez en Supabase → SQL Editor, después de las migraciones anteriores.
--
-- Solo entran quienes dieron el permiso "trabajos_ia". Escribe únicamente el servidor
-- (clave secreta); cada persona puede leer su propia fila (derecho de acceso).

create table if not exists public.pg_etiquetado (
    user_id               uuid primary key references auth.users (id) on delete cascade,
    estado                text not null default 'anotado' check (estado in (
                              'anotado', 'invitado_prueba', 'prueba_iniciada', 'prueba_hecha',
                              'invitado_entrevista', 'aprobado', 'descartado')),
    puntaje               int,
    maximo                int,
    secciones             jsonb,
    redaccion             text check (char_length(redaccion) <= 1500),
    senales               jsonb,                         -- cambios de pestaña, intentos de pegar, tiempo
    invitado_prueba_at    timestamptz,
    prueba_inicio_at      timestamptz,
    prueba_at             timestamptz,
    invitado_entrevista_at timestamptz,
    revisado_por          text,
    nota                  text check (char_length(nota) <= 1000),
    updated_at            timestamptz not null default now()
);

create index if not exists pg_etiquetado_estado_idx on public.pg_etiquetado (estado);

alter table public.pg_etiquetado enable row level security;

drop policy if exists "usuario ve su fila de etiquetado" on public.pg_etiquetado;
create policy "usuario ve su fila de etiquetado" on public.pg_etiquetado
    for select to authenticated using (auth.uid() = user_id);
