-- =====================================================================
-- OBJETIVO MENSUAL DE VENTAS
-- Idempotente: se puede ejecutar más de una vez.
-- Ver: admin y encargado de expedición. Editar: solo admin.
-- =====================================================================

create table if not exists public.objetivos_mensuales (
  mes         date primary key,            -- primer día del mes (ej: 2026-10-01)
  monto       numeric(18,2) not null check (monto >= 0),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.usuarios(id)
);

alter table public.objetivos_mensuales enable row level security;

drop policy if exists obj_sel on public.objetivos_mensuales;
create policy obj_sel on public.objetivos_mensuales for select
  using (exists (select 1 from public.usuarios u
                 where u.id = auth.uid() and u.activo
                   and u.rol in ('admin','encargado_expedicion')));

drop policy if exists obj_ins on public.objetivos_mensuales;
create policy obj_ins on public.objetivos_mensuales for insert
  with check (exists (select 1 from public.usuarios u
                      where u.id = auth.uid() and u.activo and u.rol = 'admin'));

drop policy if exists obj_upd on public.objetivos_mensuales;
create policy obj_upd on public.objetivos_mensuales for update
  using (exists (select 1 from public.usuarios u
                 where u.id = auth.uid() and u.activo and u.rol = 'admin'))
  with check (exists (select 1 from public.usuarios u
                      where u.id = auth.uid() and u.activo and u.rol = 'admin'));

grant select, insert, update on public.objetivos_mensuales to authenticated;
