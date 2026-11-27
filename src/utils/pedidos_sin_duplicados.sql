-- ============================================================================
-- Pedidos sin duplicados
-- Correr en Supabase → SQL Editor, EN DOS PASOS:
--   PASO 1: seleccioná solo el bloque "PASO 1" y ejecutalo. Lista los duplicados que hay hoy.
--           Revisá la lista. Si está bien, seguí.
--   PASO 2: seleccioná desde "PASO 2" hasta el final y ejecutalo.
--
-- Regla: un solo pedido por número de pedido (y por pedido de Odoo), salvo los cancelados.
-- Al volver a cargar un pedido cancelado, el cancelado se borra y queda el nuevo.
-- ============================================================================


-- ============================== PASO 1 ======================================
-- Duplicados actuales (sin contar cancelados). «queda» = el que se conserva (el más reciente).
select p.numero_pedido,
       p.estado,
       p.created_at,
       u.nombre as cargado_por,
       case when row_number() over (partition by p.numero_pedido order by p.created_at desc) = 1
            then 'QUEDA' else 'se borra' end as resultado
  from public.pedidos p
  left join public.usuarios u on u.id = p.vendedor_id
 where p.estado <> 'cancelado'
   and p.numero_pedido in (
     select numero_pedido from public.pedidos
      where estado <> 'cancelado'
      group by numero_pedido having count(*) > 1
   )
 order by p.numero_pedido, p.created_at desc;
-- ============================ FIN PASO 1 ====================================



-- ============================== PASO 2 ======================================

-- Borra pedidos junto con todo lo que los referencia (historial, etc.)
create or replace function public._borrar_pedidos(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_borrados integer;
begin
  if p_ids is null or array_length(p_ids, 1) is null then
    return 0;
  end if;
  -- Primero las tablas que apuntan a pedidos (historial_pedidos y cualquier otra)
  for r in
    select c.conrelid::regclass as tabla, a.attname as columna
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f'
       and c.confrelid = 'public.pedidos'::regclass
       and array_length(c.conkey, 1) = 1
  loop
    execute format('delete from %s where %I = any($1)', r.tabla, r.columna) using p_ids;
  end loop;
  delete from public.pedidos where id = any(p_ids);
  get diagnostics v_borrados = row_count;
  return v_borrados;
end;
$$;
revoke all on function public._borrar_pedidos(uuid[]) from public, anon, authenticated;

-- 2a) Duplicados actuales por número: queda el más reciente
select public._borrar_pedidos(array(
  select id from (
    select id, row_number() over (partition by numero_pedido order by created_at desc) as n
      from public.pedidos
     where estado <> 'cancelado'
  ) x where n > 1
));

-- 2b) Duplicados por pedido de Odoo (mismo pedido con otro nombre): queda el más reciente
select public._borrar_pedidos(array(
  select id from (
    select id, row_number() over (partition by odoo_id order by created_at desc) as n
      from public.pedidos
     where estado <> 'cancelado' and odoo_id is not null
  ) x where n > 1
));

-- 2c) Cancelados que ya tienen un pedido vigente con el mismo número: se borran
select public._borrar_pedidos(array(
  select c.id from public.pedidos c
   where c.estado = 'cancelado'
     and exists (select 1 from public.pedidos v
                  where v.estado <> 'cancelado' and v.numero_pedido = c.numero_pedido)
));

-- 2d) Regla en la base: no se puede repetir el número ni el pedido de Odoo (salvo cancelados)
create unique index if not exists pedidos_numero_unico
  on public.pedidos (numero_pedido) where estado <> 'cancelado';
create unique index if not exists pedidos_odoo_id_unico
  on public.pedidos (odoo_id) where odoo_id is not null and estado <> 'cancelado';

-- 2e) Consulta para el formulario: qué pedidos ya están cargados (de cualquier usuario y estado)
create or replace function public.pedidos_ya_cargados(p_numeros text[], p_odoo_ids integer[])
returns table (numero_pedido text, odoo_id integer, estado text, cargado_por text)
language sql
security definer
set search_path = public
stable
as $$
  select p.numero_pedido, p.odoo_id, p.estado, u.nombre
    from public.pedidos p
    left join public.usuarios u on u.id = p.vendedor_id
   where p.estado <> 'cancelado'
     and exists (select 1 from public.usuarios me where me.id = auth.uid() and me.activo)
     and (p.numero_pedido = any(coalesce(p_numeros, '{}'))
          or p.odoo_id = any(coalesce(p_odoo_ids, '{}')));
$$;
revoke all on function public.pedidos_ya_cargados(text[], integer[]) from public, anon;
grant execute on function public.pedidos_ya_cargados(text[], integer[]) to authenticated;

-- 2f) Al cargar de nuevo un pedido cancelado: se borra el cancelado (lo llama la app después de guardar)
create or replace function public.borrar_cancelados_de(p_numero text, p_odoo_id integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.usuarios me where me.id = auth.uid() and me.activo) then
    raise exception 'Sin permiso.';
  end if;
  -- Solo si ya existe el pedido nuevo (vigente) con ese número o ese pedido de Odoo
  if not exists (select 1 from public.pedidos
                  where estado <> 'cancelado'
                    and (numero_pedido = p_numero or (p_odoo_id is not null and odoo_id = p_odoo_id))) then
    return 0;
  end if;
  return public._borrar_pedidos(array(
    select id from public.pedidos
     where estado = 'cancelado'
       and (numero_pedido = p_numero or (p_odoo_id is not null and odoo_id = p_odoo_id))
  ));
end;
$$;
revoke all on function public.borrar_cancelados_de(text, integer) from public, anon;
grant execute on function public.borrar_cancelados_de(text, integer) to authenticated;
-- ============================ FIN PASO 2 ====================================
