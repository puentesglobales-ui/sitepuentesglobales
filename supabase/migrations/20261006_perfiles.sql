-- Perfil completo de cada candidato: la base de su CV.
-- Ejecutar una vez en Supabase → SQL Editor, después de las migraciones anteriores.
--
-- Lo completa la persona en el cuestionario (cv.html), que se guarda solo en cada paso.
-- Las listas (experiencia, formación, idiomas…) van como JSON para poder cambiar el
-- cuestionario sin migrar la base. Se limita el tamaño para evitar abusos.

create table if not exists public.pg_perfiles (
    user_id          uuid primary key references auth.users (id) on delete cascade,
    puesto           text check (char_length(puesto) <= 120),          -- a qué puesto se postula
    paises           text[] not null default '{}',                     -- destinos (códigos: de, es, gb…)
    experiencia_puesto text check (experiencia_puesto in ('ninguna', 'menos_1', '1_3', '3_5', 'mas_5')),
    situacion        jsonb not null default '{}'::jsonb,               -- pasaporte UE, permiso, disponibilidad, residencia
    experiencia      jsonb not null default '[]'::jsonb,               -- [{cargo, empresa, pais, ciudad, desde, hasta, actual, tareas}]
    formacion        jsonb not null default '[]'::jsonb,               -- [{titulo, institucion, pais, nivel, fin, reconocimiento}]
    idiomas          jsonb not null default '[]'::jsonb,               -- [{idioma, nivel, certificado}]
    habilidades      jsonb not null default '[]'::jsonb,               -- ["…"]
    licencias        jsonb not null default '[]'::jsonb,               -- ["B", "C+E", "…"]
    resumen          text check (char_length(resumen) <= 1200),
    paso             int not null default 1 check (paso between 1 and 7),
    completado       boolean not null default false,
    updated_at       timestamptz not null default now(),
    constraint pg_perfiles_tamano check (
        octet_length(situacion::text) < 4000 and octet_length(experiencia::text) < 60000 and
        octet_length(formacion::text) < 20000 and octet_length(idiomas::text) < 4000 and
        octet_length(habilidades::text) < 6000 and octet_length(licencias::text) < 2000 and
        cardinality(paises) <= 5
    )
);

alter table public.pg_perfiles enable row level security;

drop policy if exists "usuario ve su perfil" on public.pg_perfiles;
create policy "usuario ve su perfil" on public.pg_perfiles
    for select to authenticated using (auth.uid() = user_id);

drop policy if exists "usuario crea su perfil" on public.pg_perfiles;
create policy "usuario crea su perfil" on public.pg_perfiles
    for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "usuario edita su perfil" on public.pg_perfiles;
create policy "usuario edita su perfil" on public.pg_perfiles
    for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
