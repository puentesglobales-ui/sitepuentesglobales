-- Marca blanca: empresas (organizaciones), su marca, sus precios, sus combos y sus medios de pago.
-- Ejecutar una vez en Supabase → SQL Editor, después de las migraciones anteriores.
--
-- Regla general: una fila con org_id NULL es "de la plataforma" (Puentes Globales) y se usa
-- como respaldo cuando la empresa no definió la suya.
-- Todas estas tablas se leen y escriben SOLO desde el servidor (clave secreta), que controla
-- quién es superadmin o admin de cada empresa. RLS activado sin políticas = nadie más accede.

create table if not exists public.pg_organizaciones (
    id              uuid primary key default gen_random_uuid(),
    slug            text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
    nombre          text not null,
    dominio         text unique,                 -- dominio propio opcional, p. ej. empleo.agencia.com
    logo_url        text,
    color_primario  text not null default '#FF6A00' check (color_primario ~ '^#[0-9a-fA-F]{6}$'),
    color_acento    text not null default '#0f172a' check (color_acento ~ '^#[0-9a-fA-F]{6}$'),
    email_contacto  text,
    -- Comisión de Puentes Globales sobre cada venta de la empresa. NULL = la de la plataforma
    -- (pg_plataforma.comision_pct). Si cobra con nuestros medios de pago se descuenta en el
    -- momento; si cobra con los suyos, se le factura según pg_ventas.
    comision_pct    numeric(5, 2) check (comision_pct >= 0 and comision_pct <= 100),
    activa          boolean not null default true,
    created_at      timestamptz not null default now()
);

-- Configuración general de la plataforma (una sola fila).
create table if not exists public.pg_plataforma (
    id            boolean primary key default true check (id),
    comision_pct  numeric(5, 2) not null default 15 check (comision_pct >= 0 and comision_pct <= 100),
    updated_at    timestamptz not null default now()
);
insert into public.pg_plataforma (id) values (true) on conflict (id) do nothing;

-- Registro de ventas (lo completa la integración de pagos): base para liquidar comisiones.
create table if not exists public.pg_ventas (
    id              uuid primary key default gen_random_uuid(),
    org_id          uuid references public.pg_organizaciones (id) on delete set null,
    user_id         uuid references auth.users (id) on delete set null,
    concepto        text not null,               -- código de producto o 'combo:<id>'
    monto           numeric(10, 2) not null check (monto >= 0),
    moneda          text not null check (moneda ~ '^[A-Z]{3}$'),
    metodo          text not null check (metodo in ('mercadopago', 'stripe', 'paypal')),
    cuenta          text not null check (cuenta in ('empresa', 'plataforma')),  -- con qué medio de pago se cobró
    comision_pct    numeric(5, 2) not null,
    comision_monto  numeric(10, 2) not null,
    estado          text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada', 'reembolsada')),
    referencia      text,                        -- id del pago en el proveedor
    created_at      timestamptz not null default now()
);
create index if not exists pg_ventas_org_idx on public.pg_ventas (org_id, created_at desc);

-- Quién administra cada empresa.
create table if not exists public.pg_org_miembros (
    org_id      uuid not null references public.pg_organizaciones (id) on delete cascade,
    user_id     uuid not null references auth.users (id) on delete cascade,
    rol         text not null default 'admin' check (rol in ('owner', 'admin')),
    created_at  timestamptz not null default now(),
    primary key (org_id, user_id)
);

-- Catálogo base de la plataforma. Solo servicios de PREPARACIÓN: buscar ofertas y postularse
-- es gratis siempre y no se vende.
create table if not exists public.pg_productos (
    codigo       text primary key check (codigo ~ '^[a-z0-9_]{2,40}$'),
    nombre       text not null,
    descripcion  text,
    precio_base  numeric(10, 2) not null check (precio_base >= 0),
    moneda       text not null default 'USD' check (moneda ~ '^[A-Z]{3}$'),
    periodo      text not null default 'unico' check (periodo in ('unico', 'mes')),
    activo       boolean not null default true
);

-- Cada herramienta es un producto. Precios base orientativos: el superadmin los cambia y
-- cada empresa pone los suyos. Los tests valen 0 en Puentes Globales (sirven para atraer
-- candidatos), pero una empresa puede cobrarlos.
insert into public.pg_productos (codigo, nombre, descripcion, precio_base, moneda, periodo) values
    ('tests',          'Tests de selección',            'Razonamiento, numérico, idiomas, personalidad, psicométrico y CI',         0, 'USD', 'unico'),
    ('simulador',      'Simulador de entrevistas',      'Entrevistas de práctica con IA, sin límite',                              15, 'USD', 'mes'),
    ('constructor_cv', 'Constructor de CV',             'CV en formato europeo, alemán o británico, adaptado a cada oferta',       12, 'USD', 'mes'),
    ('ats',            'Escáner ATS',                   'Revisión de tu CV contra cada oferta, sin límite',                         9, 'USD', 'mes'),
    ('idiomas',        'Aprendizaje de idiomas',        'Práctica del idioma del país de destino orientada al trabajo',            19, 'USD', 'mes'),
    ('curso_skool',    'Curso de búsqueda de empleo',   'Curso completo en Skool: búsqueda, CV por puesto y entrevistas',          49, 'USD', 'unico')
on conflict (codigo) do nothing;

-- Precio propio de cada empresa para cada producto (si no hay fila, vale el precio base).
create table if not exists public.pg_org_precios (
    org_id    uuid not null references public.pg_organizaciones (id) on delete cascade,
    producto  text not null references public.pg_productos (codigo) on delete cascade,
    precio    numeric(10, 2) not null check (precio >= 0),
    moneda    text not null default 'USD' check (moneda ~ '^[A-Z]{3}$'),
    visible   boolean not null default true,
    primary key (org_id, producto)
);

-- Combos: varios productos con un precio propio. org_id NULL = combo de la plataforma.
create table if not exists public.pg_combos (
    id           uuid primary key default gen_random_uuid(),
    org_id       uuid references public.pg_organizaciones (id) on delete cascade,
    nombre       text not null,
    descripcion  text,
    precio       numeric(10, 2) not null check (precio >= 0),
    moneda       text not null default 'USD' check (moneda ~ '^[A-Z]{3}$'),
    periodo      text not null default 'unico' check (periodo in ('unico', 'mes')),
    activo       boolean not null default true,
    created_at   timestamptz not null default now()
);

create table if not exists public.pg_combo_items (
    combo_id  uuid not null references public.pg_combos (id) on delete cascade,
    producto  text not null references public.pg_productos (codigo) on delete cascade,
    cantidad  int not null default 1 check (cantidad > 0),
    primary key (combo_id, producto)
);

-- Combo de la plataforma: el Plan Profesional son las herramientas de preparación juntas.
do $$
declare nuevo uuid;
begin
    if not exists (select 1 from public.pg_combos where org_id is null and nombre = 'Plan Profesional') then
        insert into public.pg_combos (org_id, nombre, descripcion, precio, moneda, periodo)
        values (null, 'Plan Profesional', 'Simulador, constructor de CV y escáner ATS sin límite', 29, 'USD', 'mes')
        returning id into nuevo;
        insert into public.pg_combo_items (combo_id, producto) values
            (nuevo, 'simulador'), (nuevo, 'constructor_cv'), (nuevo, 'ats');
    end if;
end $$;

-- Medios de pago. org_id NULL = los de Puentes Globales (respaldo).
-- config_publica: datos que pueden mostrarse (p. ej. clave pública de Stripe).
-- credenciales: claves secretas CIFRADAS por el servidor (AES-256-GCM con PAYMENTS_ENC_KEY).
create table if not exists public.pg_org_pagos (
    id              uuid primary key default gen_random_uuid(),
    org_id          uuid references public.pg_organizaciones (id) on delete cascade,
    metodo          text not null check (metodo in ('mercadopago', 'stripe', 'paypal')),
    activo          boolean not null default true,
    modo            text not null default 'prueba' check (modo in ('prueba', 'produccion')),
    config_publica  jsonb not null default '{}'::jsonb,
    credenciales    text,
    updated_at      timestamptz not null default now()
);
create unique index if not exists pg_org_pagos_unico on public.pg_org_pagos (coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid), metodo);

-- Cada candidato pertenece a la empresa por la que se registró (NULL = Puentes Globales).
alter table public.pg_candidatos add column if not exists org_id uuid references public.pg_organizaciones (id) on delete set null;
create index if not exists pg_candidatos_org_idx on public.pg_candidatos (org_id);

alter table public.pg_organizaciones enable row level security;
alter table public.pg_plataforma enable row level security;
alter table public.pg_ventas enable row level security;
alter table public.pg_org_miembros enable row level security;
alter table public.pg_productos enable row level security;
alter table public.pg_org_precios enable row level security;
alter table public.pg_combos enable row level security;
alter table public.pg_combo_items enable row level security;
alter table public.pg_org_pagos enable row level security;
