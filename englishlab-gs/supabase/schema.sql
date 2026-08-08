-- =====================================================================
-- ENGLISHLAB GS — ESQUEMA DE BASE DE DATOS Y POLÍTICAS RLS (SUPABASE)
-- =====================================================================
-- Ejecutar completo en el SQL Editor de Supabase (proyecto nuevo o
-- existente). Es idempotente: puede ejecutarse varias veces sin romper
-- datos ya creados (usa IF NOT EXISTS / DROP POLICY IF EXISTS).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. EXTENSIONES
-- ---------------------------------------------------------------------
create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------
-- 2. TABLAS
-- ---------------------------------------------------------------------

create table if not exists grados (
  id          bigint generated always as identity primary key,
  nombre      text not null unique,              -- '7', '8', '9', '10', '11'
  created_at  timestamptz not null default now()
);

create table if not exists salones (
  id          bigint generated always as identity primary key,
  nombre      text not null,                      -- '7-1', '7-2', etc.
  grado_id    bigint not null references grados(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (nombre, grado_id)
);

-- usuarios: espejo de auth.users con metadata de aplicación.
-- El id coincide 1:1 con auth.users.id (login se hace con "codigo" mapeado
-- a un email interno: <codigo>@englishlabgs.local)
create table if not exists usuarios (
  id          uuid primary key references auth.users(id) on delete cascade,
  nombre      text not null,
  rol         text not null check (rol in ('student', 'teacher', 'admin')),
  codigo      text not null unique,
  grado_id    bigint references grados(id) on delete set null,
  salon_id    bigint references salones(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Asignación de profesores a salones (un profesor puede tener varios)
create table if not exists profesor_salones (
  id          bigint generated always as identity primary key,
  profesor_id uuid not null references usuarios(id) on delete cascade,
  salon_id    bigint not null references salones(id) on delete cascade,
  unique (profesor_id, salon_id)
);

create table if not exists actividades (
  id          bigint generated always as identity primary key,
  titulo      text not null,
  descripcion text,
  grado_id    bigint references grados(id) on delete cascade,
  salon_id    bigint references salones(id) on delete cascade,
  creado_por  uuid references usuarios(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists simulacros (
  id             bigint generated always as identity primary key,
  titulo         text not null,
  preguntas_json jsonb not null default '[]'::jsonb,
  estado         text not null default 'borrador' check (estado in ('borrador','activo','cerrado')),
  tiempo         integer not null default 60,     -- minutos
  grado_id       bigint references grados(id) on delete cascade,
  salon_id       bigint references salones(id) on delete cascade,
  creado_por     uuid references usuarios(id) on delete set null,
  created_at     timestamptz not null default now()
);

create table if not exists resultados (
  id           bigint generated always as identity primary key,
  usuario_id   uuid not null references usuarios(id) on delete cascade,
  simulacro_id bigint not null references simulacros(id) on delete cascade,
  puntaje      numeric not null default 0,
  respuestas_json jsonb default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  unique (usuario_id, simulacro_id)
);

create table if not exists progreso (
  id          bigint generated always as identity primary key,
  usuario_id  uuid not null references usuarios(id) on delete cascade,
  area        text not null,                      -- 'reading', 'listening', 'grammar', etc.
  puntaje     numeric not null default 0,
  updated_at  timestamptz not null default now(),
  unique (usuario_id, area)
);

create table if not exists notificaciones (
  id          bigint generated always as identity primary key,
  usuario_id  uuid not null references usuarios(id) on delete cascade,
  mensaje     text not null,
  leido       boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Índices de apoyo
create index if not exists idx_usuarios_salon on usuarios(salon_id);
create index if not exists idx_actividades_salon on actividades(salon_id);
create index if not exists idx_simulacros_salon on simulacros(salon_id);
create index if not exists idx_resultados_usuario on resultados(usuario_id);
create index if not exists idx_notificaciones_usuario on notificaciones(usuario_id, leido);

-- ---------------------------------------------------------------------
-- 3. FUNCIÓN AUXILIAR: rol y salón del usuario autenticado
-- (security definer para poder leer 'usuarios' dentro de las políticas
--  sin caer en recursión infinita de RLS)
-- ---------------------------------------------------------------------
create or replace function auth_rol()
returns text
language sql security definer stable
as $$
  select rol from usuarios where id = auth.uid();
$$;

create or replace function auth_salon_id()
returns bigint
language sql security definer stable
as $$
  select salon_id from usuarios where id = auth.uid();
$$;

create or replace function auth_grado_id()
returns bigint
language sql security definer stable
as $$
  select grado_id from usuarios where id = auth.uid();
$$;

create or replace function is_teacher_of(target_salon bigint)
returns boolean
language sql security definer stable
as $$
  select exists (
    select 1 from profesor_salones
    where profesor_id = auth.uid() and salon_id = target_salon
  );
$$;

-- ---------------------------------------------------------------------
-- 4. ACTIVAR RLS
-- ---------------------------------------------------------------------
alter table grados enable row level security;
alter table salones enable row level security;
alter table usuarios enable row level security;
alter table profesor_salones enable row level security;
alter table actividades enable row level security;
alter table simulacros enable row level security;
alter table resultados enable row level security;
alter table progreso enable row level security;
alter table notificaciones enable row level security;

-- ---------------------------------------------------------------------
-- 5. POLÍTICAS — GRADOS / SALONES (lectura general, escritura solo admin)
-- ---------------------------------------------------------------------
drop policy if exists "grados_select_all" on grados;
create policy "grados_select_all" on grados for select using (true);

drop policy if exists "grados_admin_write" on grados;
create policy "grados_admin_write" on grados for all
  using (auth_rol() = 'admin') with check (auth_rol() = 'admin');

drop policy if exists "salones_select_all" on salones;
create policy "salones_select_all" on salones for select using (true);

drop policy if exists "salones_admin_write" on salones;
create policy "salones_admin_write" on salones for all
  using (auth_rol() = 'admin') with check (auth_rol() = 'admin');

-- ---------------------------------------------------------------------
-- 6. POLÍTICAS — USUARIOS
-- ---------------------------------------------------------------------
drop policy if exists "usuarios_select_self" on usuarios;
create policy "usuarios_select_self" on usuarios for select
  using (
    id = auth.uid()
    or auth_rol() = 'admin'
    or (auth_rol() = 'teacher' and is_teacher_of(salon_id))
    or (auth_rol() = 'student' and salon_id = auth_salon_id())
  );

drop policy if exists "usuarios_admin_write" on usuarios;
create policy "usuarios_admin_write" on usuarios for all
  using (auth_rol() = 'admin') with check (auth_rol() = 'admin');

drop policy if exists "usuarios_self_update" on usuarios;
create policy "usuarios_self_update" on usuarios for update
  using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------------
-- 7. POLÍTICAS — PROFESOR_SALONES
-- ---------------------------------------------------------------------
drop policy if exists "profesor_salones_select" on profesor_salones;
create policy "profesor_salones_select" on profesor_salones for select
  using (profesor_id = auth.uid() or auth_rol() = 'admin');

drop policy if exists "profesor_salones_admin_write" on profesor_salones;
create policy "profesor_salones_admin_write" on profesor_salones for all
  using (auth_rol() = 'admin') with check (auth_rol() = 'admin');

-- ---------------------------------------------------------------------
-- 8. POLÍTICAS — ACTIVIDADES
-- ---------------------------------------------------------------------
drop policy if exists "actividades_select" on actividades;
create policy "actividades_select" on actividades for select
  using (
    auth_rol() = 'admin'
    or (auth_rol() = 'teacher' and is_teacher_of(salon_id))
    or (auth_rol() = 'student' and (salon_id = auth_salon_id() or grado_id = auth_grado_id()))
  );

drop policy if exists "actividades_teacher_write" on actividades;
create policy "actividades_teacher_write" on actividades for insert
  with check (
    auth_rol() = 'admin'
    or (auth_rol() = 'teacher' and is_teacher_of(salon_id))
  );

drop policy if exists "actividades_teacher_update" on actividades;
create policy "actividades_teacher_update" on actividades for update
  using (auth_rol() = 'admin' or (auth_rol() = 'teacher' and is_teacher_of(salon_id)));

drop policy if exists "actividades_teacher_delete" on actividades;
create policy "actividades_teacher_delete" on actividades for delete
  using (auth_rol() = 'admin' or (auth_rol() = 'teacher' and is_teacher_of(salon_id)));

-- ---------------------------------------------------------------------
-- 9. POLÍTICAS — SIMULACROS (mismo patrón que actividades)
-- ---------------------------------------------------------------------
drop policy if exists "simulacros_select" on simulacros;
create policy "simulacros_select" on simulacros for select
  using (
    auth_rol() = 'admin'
    or (auth_rol() = 'teacher' and is_teacher_of(salon_id))
    or (auth_rol() = 'student' and (salon_id = auth_salon_id() or grado_id = auth_grado_id()) and estado <> 'borrador')
  );

drop policy if exists "simulacros_teacher_write" on simulacros;
create policy "simulacros_teacher_write" on simulacros for insert
  with check (auth_rol() = 'admin' or (auth_rol() = 'teacher' and is_teacher_of(salon_id)));

drop policy if exists "simulacros_teacher_update" on simulacros;
create policy "simulacros_teacher_update" on simulacros for update
  using (auth_rol() = 'admin' or (auth_rol() = 'teacher' and is_teacher_of(salon_id)));

drop policy if exists "simulacros_teacher_delete" on simulacros;
create policy "simulacros_teacher_delete" on simulacros for delete
  using (auth_rol() = 'admin' or (auth_rol() = 'teacher' and is_teacher_of(salon_id)));

-- ---------------------------------------------------------------------
-- 10. POLÍTICAS — RESULTADOS
-- ---------------------------------------------------------------------
drop policy if exists "resultados_select" on resultados;
create policy "resultados_select" on resultados for select
  using (
    usuario_id = auth.uid()
    or auth_rol() = 'admin'
    or (auth_rol() = 'teacher' and exists (
          select 1 from usuarios u where u.id = resultados.usuario_id
          and is_teacher_of(u.salon_id)))
  );

drop policy if exists "resultados_student_insert" on resultados;
create policy "resultados_student_insert" on resultados for insert
  with check (usuario_id = auth.uid() or auth_rol() = 'admin');

drop policy if exists "resultados_student_update" on resultados;
create policy "resultados_student_update" on resultados for update
  using (usuario_id = auth.uid() or auth_rol() = 'admin');

-- ---------------------------------------------------------------------
-- 11. POLÍTICAS — PROGRESO
-- ---------------------------------------------------------------------
drop policy if exists "progreso_select" on progreso;
create policy "progreso_select" on progreso for select
  using (
    usuario_id = auth.uid()
    or auth_rol() = 'admin'
    or (auth_rol() = 'teacher' and exists (
          select 1 from usuarios u where u.id = progreso.usuario_id
          and is_teacher_of(u.salon_id)))
  );

drop policy if exists "progreso_write" on progreso;
create policy "progreso_write" on progreso for all
  using (usuario_id = auth.uid() or auth_rol() = 'admin')
  with check (usuario_id = auth.uid() or auth_rol() = 'admin');

-- ---------------------------------------------------------------------
-- 12. POLÍTICAS — NOTIFICACIONES
-- ---------------------------------------------------------------------
drop policy if exists "notificaciones_select" on notificaciones;
create policy "notificaciones_select" on notificaciones for select
  using (usuario_id = auth.uid() or auth_rol() = 'admin');

drop policy if exists "notificaciones_insert" on notificaciones;
create policy "notificaciones_insert" on notificaciones for insert
  with check (auth_rol() in ('admin','teacher') or usuario_id = auth.uid());

drop policy if exists "notificaciones_update" on notificaciones;
create policy "notificaciones_update" on notificaciones for update
  using (usuario_id = auth.uid() or auth_rol() = 'admin');

-- ---------------------------------------------------------------------
-- 13. REALTIME
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table actividades;
alter publication supabase_realtime add table notificaciones;
alter publication supabase_realtime add table simulacros;

-- ---------------------------------------------------------------------
-- 14. SEED MÍNIMO DE GRADOS (opcional, ajustar/quitar si no se desea)
-- ---------------------------------------------------------------------
insert into grados (nombre)
  values ('7'), ('8'), ('9'), ('10'), ('11')
on conflict (nombre) do nothing;
