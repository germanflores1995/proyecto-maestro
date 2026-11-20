-- 1) Id interno del pedido en Odoo (no cambia aunque le cambien el nombre/número al pedido).
--    Es una columna nueva y opcional: no modifica nada de lo existente.
alter table public.pedidos add column if not exists odoo_id integer;
create index if not exists pedidos_odoo_id_idx on public.pedidos (odoo_id);

-- 2) Registro de lo que se valida en Odoo desde «Validar salidas» (solo administrador).
create table if not exists public.registro_validaciones_odoo (
  id            bigint generated always as identity primary key,
  creado_at     timestamptz not null default now(),
  usuario_id    uuid not null,
  usuario_nombre text,
  numero_pedido text not null,
  resultado     text not null,   -- validada | sin_stock | error | sin_cambios
  detalle       text,
  entregas      jsonb,
  faltantes     jsonb
);

create index if not exists registro_validaciones_odoo_creado_idx on public.registro_validaciones_odoo (creado_at desc);
create index if not exists registro_validaciones_odoo_pedido_idx on public.registro_validaciones_odoo (numero_pedido);

alter table public.registro_validaciones_odoo enable row level security;

drop policy if exists "registro_validaciones_odoo_admin_select" on public.registro_validaciones_odoo;
create policy "registro_validaciones_odoo_admin_select" on public.registro_validaciones_odoo
  for select to authenticated
  using (exists (select 1 from public.usuarios u where u.id = auth.uid() and u.rol = 'admin' and u.activo));

drop policy if exists "registro_validaciones_odoo_admin_insert" on public.registro_validaciones_odoo;
create policy "registro_validaciones_odoo_admin_insert" on public.registro_validaciones_odoo
  for insert to authenticated
  with check (
    usuario_id = auth.uid()
    and exists (select 1 from public.usuarios u where u.id = auth.uid() and u.rol = 'admin' and u.activo)
  );
-- Sin políticas de update ni delete: el registro no se puede modificar ni borrar desde la app.
