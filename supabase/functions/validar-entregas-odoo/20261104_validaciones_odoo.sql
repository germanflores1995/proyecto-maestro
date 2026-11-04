-- Validación de albaranes de salida en Odoo (entregas de expedición)
-- Una fila por albarán. Estados posibles:
--   pendiente       : falta validar (motivo explica por qué)
--   validado_odoo   : Odoo lo tiene como hecho (validado por la app o a mano en Odoo)
--   validado_manual : lo resolvió una persona fuera de Odoo, con comentario obligatorio

create table if not exists validaciones_odoo (
  id uuid primary key default gen_random_uuid(),
  numero_pedido text not null,
  picking_id integer,                       -- id del albarán en Odoo (null si el pedido no tiene albarán)
  picking_name text,
  dia date not null,                        -- día en que expedición marcó la entrega
  estado text not null check (estado in ('pendiente', 'validado_odoo', 'validado_manual')),
  estado_odoo text,                         -- último estado leído de Odoo (draft, assigned, done, ...)
  motivo text,                              -- por qué quedó pendiente
  comentario text,                          -- obligatorio cuando es validado_manual
  validado_por uuid,
  validado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists validaciones_odoo_picking_idx
  on validaciones_odoo (picking_id) where picking_id is not null;
create index if not exists validaciones_odoo_pedido_idx on validaciones_odoo (numero_pedido);
create index if not exists validaciones_odoo_dia_idx on validaciones_odoo (dia, estado);

-- Estado de la integración con Odoo (una sola fila)
create table if not exists integracion_odoo_estado (
  id integer primary key default 1 check (id = 1),
  ok boolean not null default true,
  version text,
  mensaje text,
  actualizado_at timestamptz not null default now()
);
insert into integracion_odoo_estado (id) values (1) on conflict (id) do nothing;

-- Acceso: solo admin y encargado de expedición
alter table validaciones_odoo enable row level security;
alter table integracion_odoo_estado enable row level security;

create policy "validaciones: admin y encargado de expedicion"
  on validaciones_odoo for all
  using (rol_actual() in ('admin', 'encargado_expedicion'))
  with check (rol_actual() in ('admin', 'encargado_expedicion'));

create policy "integracion: admin y encargado de expedicion"
  on integracion_odoo_estado for all
  using (rol_actual() in ('admin', 'encargado_expedicion'))
  with check (rol_actual() in ('admin', 'encargado_expedicion'));
