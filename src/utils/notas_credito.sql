-- ============================================================================
-- Devoluciones / Notas de crédito
-- Tablas nuevas (no toca las tablas viejas "devoluciones" ni "devolucion_articulos").
-- Se puede correr más de una vez.
--
--  · Admin y Encargado de expedición crean notas de crédito (y las pueden ver).
--  · Caja (y admin) las ve y las marca como realizadas.
--  · Una nota pendiente la puede anular el admin o quien la creó.
--  · Todo se graba por funciones (RPC); desde la app no se puede escribir directo en las tablas.
-- ============================================================================

create table if not exists public.notas_credito (
  id               bigint generated always as identity primary key,
  pedido_odoo_id   integer      not null,          -- id interno del pedido en Odoo
  numero_pedido    text         not null,
  cliente          text         not null,
  total            numeric(14,2) not null default 0,
  estado           text         not null default 'pendiente'
                   check (estado in ('pendiente', 'realizada', 'anulada')),
  creado_por       uuid         references public.usuarios(id),
  creado_por_nombre text,
  created_at       timestamptz  not null default now(),
  realizada_por    uuid         references public.usuarios(id),
  realizada_por_nombre text,
  realizada_at     timestamptz,
  anulada_por      uuid         references public.usuarios(id),
  anulada_por_nombre text,
  anulada_at       timestamptz
);

create table if not exists public.notas_credito_items (
  id               bigint generated always as identity primary key,
  nota_id          bigint       not null references public.notas_credito(id) on delete cascade,
  linea_odoo_id    integer      not null,          -- id de la línea del pedido en Odoo
  codigo           text,
  producto         text         not null,
  cantidad_vendida numeric(14,4) not null,
  cantidad         numeric(14,4) not null check (cantidad > 0),
  precio_unitario  numeric(16,4) not null,
  descuento_pct    numeric(7,4)  not null default 0,
  descuento        numeric(14,2) not null default 0, -- importe del descuento (como en la hoja de Odoo)
  total            numeric(14,2) not null
);

create index if not exists notas_credito_estado_idx on public.notas_credito (estado, created_at desc);
create index if not exists notas_credito_pedido_idx on public.notas_credito (pedido_odoo_id);
create index if not exists notas_credito_items_nota_idx on public.notas_credito_items (nota_id);

-- ---------------------------------------------------------------------------
-- Permisos de lectura (RLS)
-- ---------------------------------------------------------------------------
alter table public.notas_credito enable row level security;
alter table public.notas_credito_items enable row level security;

grant select on public.notas_credito, public.notas_credito_items to authenticated;

drop policy if exists "notas_credito_select" on public.notas_credito;
create policy "notas_credito_select" on public.notas_credito
  for select to authenticated
  using (exists (
    select 1 from public.usuarios u
    where u.id = auth.uid() and u.activo
      and u.rol in ('admin', 'encargado_expedicion', 'caja')
  ));

drop policy if exists "notas_credito_items_select" on public.notas_credito_items;
create policy "notas_credito_items_select" on public.notas_credito_items
  for select to authenticated
  using (exists (
    select 1 from public.usuarios u
    where u.id = auth.uid() and u.activo
      and u.rol in ('admin', 'encargado_expedicion', 'caja')
  ));
-- Sin políticas de insert/update/delete: se escribe solo por las funciones de abajo.

-- ---------------------------------------------------------------------------
-- Crear una nota de crédito (admin / encargado de expedición)
-- p_items: [{ linea_odoo_id, codigo, producto, cantidad_vendida, cantidad,
--             precio_unitario, descuento_pct, descuento, total }]
-- Controla que no se devuelva más de lo vendido menos lo ya devuelto.
-- ---------------------------------------------------------------------------
create or replace function public.crear_nota_credito(
  p_pedido_odoo_id integer,
  p_numero_pedido  text,
  p_cliente        text,
  p_items          jsonb
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario public.usuarios%rowtype;
  v_nota_id bigint;
  v_item    jsonb;
  v_ya      numeric;
  v_total   numeric := 0;
begin
  select * into v_usuario from public.usuarios where id = auth.uid();
  if v_usuario.id is null or not v_usuario.activo
     or v_usuario.rol not in ('admin', 'encargado_expedicion') then
    raise exception 'No tenés permiso para crear notas de crédito.';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La nota de crédito no tiene productos.';
  end if;

  -- Un pedido a la vez, para que dos personas no devuelvan lo mismo al mismo tiempo
  perform pg_advisory_xact_lock(p_pedido_odoo_id);

  for v_item in select * from jsonb_array_elements(p_items) loop
    if (v_item->>'cantidad')::numeric <= 0 then
      raise exception 'Cantidad inválida en %.', v_item->>'producto';
    end if;
    select coalesce(sum(i.cantidad), 0) into v_ya
      from public.notas_credito_items i
      join public.notas_credito n on n.id = i.nota_id
     where n.pedido_odoo_id = p_pedido_odoo_id
       and n.estado <> 'anulada'
       and i.linea_odoo_id = (v_item->>'linea_odoo_id')::integer;
    if v_ya + (v_item->>'cantidad')::numeric > (v_item->>'cantidad_vendida')::numeric + 0.0001 then
      raise exception 'De «%» ya se devolvió %; no se puede devolver %.',
        v_item->>'producto', v_ya, v_item->>'cantidad';
    end if;
    v_total := v_total + (v_item->>'total')::numeric;
  end loop;

  insert into public.notas_credito
    (pedido_odoo_id, numero_pedido, cliente, total, creado_por, creado_por_nombre)
  values
    (p_pedido_odoo_id, p_numero_pedido, p_cliente, round(v_total, 2), v_usuario.id, v_usuario.nombre)
  returning id into v_nota_id;

  insert into public.notas_credito_items
    (nota_id, linea_odoo_id, codigo, producto, cantidad_vendida, cantidad,
     precio_unitario, descuento_pct, descuento, total)
  select v_nota_id,
         (x->>'linea_odoo_id')::integer,
         nullif(x->>'codigo', ''),
         x->>'producto',
         (x->>'cantidad_vendida')::numeric,
         (x->>'cantidad')::numeric,
         (x->>'precio_unitario')::numeric,
         coalesce((x->>'descuento_pct')::numeric, 0),
         coalesce((x->>'descuento')::numeric, 0),
         (x->>'total')::numeric
    from jsonb_array_elements(p_items) x;

  return v_nota_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Caja marca la nota como realizada (caja / admin)
-- ---------------------------------------------------------------------------
create or replace function public.marcar_nota_credito_realizada(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario public.usuarios%rowtype;
begin
  select * into v_usuario from public.usuarios where id = auth.uid();
  if v_usuario.id is null or not v_usuario.activo or v_usuario.rol not in ('caja', 'admin') then
    raise exception 'Solo Caja puede marcar notas de crédito como realizadas.';
  end if;

  update public.notas_credito
     set estado = 'realizada',
         realizada_por = v_usuario.id,
         realizada_por_nombre = v_usuario.nombre,
         realizada_at = now()
   where id = p_id and estado = 'pendiente';
  if not found then
    raise exception 'La nota de crédito ya no está pendiente.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Anular una nota pendiente (admin, o quien la creó)
-- ---------------------------------------------------------------------------
create or replace function public.anular_nota_credito(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario public.usuarios%rowtype;
begin
  select * into v_usuario from public.usuarios where id = auth.uid();
  if v_usuario.id is null or not v_usuario.activo then
    raise exception 'Sin permiso.';
  end if;

  update public.notas_credito
     set estado = 'anulada',
         anulada_por = v_usuario.id,
         anulada_por_nombre = v_usuario.nombre,
         anulada_at = now()
   where id = p_id
     and estado = 'pendiente'
     and (v_usuario.rol = 'admin'
          or (v_usuario.rol = 'encargado_expedicion' and creado_por = v_usuario.id));
  if not found then
    raise exception 'No se puede anular: ya no está pendiente o no la creaste vos.';
  end if;
end;
$$;

revoke all on function public.crear_nota_credito(integer, text, text, jsonb) from public, anon;
revoke all on function public.marcar_nota_credito_realizada(bigint) from public, anon;
revoke all on function public.anular_nota_credito(bigint) from public, anon;
grant execute on function public.crear_nota_credito(integer, text, text, jsonb) to authenticated;
grant execute on function public.marcar_nota_credito_realizada(bigint) to authenticated;
grant execute on function public.anular_nota_credito(bigint) to authenticated;
