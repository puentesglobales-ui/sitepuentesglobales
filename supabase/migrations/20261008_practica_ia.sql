-- Sesiones de práctica con IA (simulador de entrevistas e idiomas).
-- Ejecutar una vez en Supabase → SQL Editor, después de las migraciones anteriores.
--
-- La IA la pone Alex IO (API motor). Puentes Globales guarda aquí la conversación que ve
-- la persona, el resultado y el progreso. Escribe solo el servidor (clave secreta); cada
-- persona puede leer sus propias sesiones.

create table if not exists public.pg_sesiones_ia (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users (id) on delete cascade,
    producto      text not null check (producto in ('simulador', 'idiomas')),
    org_id        uuid,                                  -- empresa de marca blanca (null = plataforma)
    session_id    text not null unique,                  -- id de la sesión en Alex IO
    contexto      jsonb not null default '{}'::jsonb,    -- puesto, país, nivel, lección…
    estado        text not null default 'activa' check (estado in ('activa', 'terminada', 'vencida')),
    turnos        int not null default 0,
    mensajes      jsonb not null default '[]'::jsonb,    -- [{rol, texto, evaluacion?, clave?, at}]
    resultado     jsonb,                                 -- lo que devuelve Alex IO al cerrar
    puntaje       int check (puntaje between 0 and 100),
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    terminada_at  timestamptz,
    constraint pg_sesiones_ia_tamano check (octet_length(mensajes::text) < 200000 and octet_length(contexto::text) < 8000)
);

create index if not exists pg_sesiones_ia_user_idx on public.pg_sesiones_ia (user_id, producto, created_at desc);

alter table public.pg_sesiones_ia enable row level security;

drop policy if exists "usuario ve sus sesiones de practica" on public.pg_sesiones_ia;
create policy "usuario ve sus sesiones de practica" on public.pg_sesiones_ia
    for select to authenticated using (auth.uid() = user_id);
