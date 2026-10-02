-- Cobro real: ventas con su detalle y accesos a los productos comprados.
-- Ejecutar una vez en Supabase → SQL Editor, después de 20261004_marca_blanca.sql.

-- Detalle de la venta (qué productos incluye) y vínculo con el checkout del proveedor.
alter table public.pg_ventas add column if not exists items jsonb not null default '[]'::jsonb;  -- [{producto, cantidad, periodo}]
alter table public.pg_ventas add column if not exists checkout_id text;                           -- sesión/preferencia/orden del proveedor
alter table public.pg_ventas add column if not exists aprobada_at timestamptz;
create unique index if not exists pg_ventas_referencia_unica on public.pg_ventas (metodo, referencia) where referencia is not null;

-- La persona puede ver sus propias compras (para la pantalla de resultado y "Mis datos").
drop policy if exists "usuario ve sus compras" on public.pg_ventas;
create policy "usuario ve sus compras" on public.pg_ventas
    for select to authenticated using (auth.uid() = user_id);

-- Acceso a cada producto: lo da una compra aprobada (o el equipo, a mano).
-- vence NULL = sin vencimiento. Los productos mensuales dan 30 días por compra.
create table if not exists public.pg_accesos (
    id          bigint generated always as identity primary key,
    user_id     uuid not null references auth.users (id) on delete cascade,
    org_id      uuid references public.pg_organizaciones (id) on delete set null,
    producto    text not null references public.pg_productos (codigo) on delete cascade,
    origen      text not null default 'compra' check (origen in ('compra', 'manual')),
    venta_id    uuid references public.pg_ventas (id) on delete set null,
    vence       timestamptz,
    created_at  timestamptz not null default now()
);
create index if not exists pg_accesos_user_idx on public.pg_accesos (user_id, producto, vence);

alter table public.pg_accesos enable row level security;

-- Cada persona ve sus accesos. Solo el servidor (clave secreta) los crea.
drop policy if exists "usuario ve sus accesos" on public.pg_accesos;
create policy "usuario ve sus accesos" on public.pg_accesos
    for select to authenticated using (auth.uid() = user_id);
