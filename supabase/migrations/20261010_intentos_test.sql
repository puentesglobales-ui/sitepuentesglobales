-- Intentos individualizados de tests. Ejecutar en Supabase SQL Editor.
create table if not exists public.pg_intentos_test (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    test text not null check (test in ('ci', 'razonamiento', 'etiquetado')),
    preguntas jsonb not null,
    created_at timestamptz not null default now(),
    entregado_at timestamptz
);
create index if not exists pg_intentos_test_usuario_idx on public.pg_intentos_test (user_id, test, created_at desc);
alter table public.pg_intentos_test enable row level security;
drop policy if exists "usuario ve sus intentos de test" on public.pg_intentos_test;
create policy "usuario ve sus intentos de test" on public.pg_intentos_test
    for select to authenticated using (auth.uid() = user_id);
-- No hay políticas de insert/update/delete para authenticated: solo escribe el servidor.
