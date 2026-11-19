-- Agrega las ubicaciones MOSTRADOR y PALET COMPLETO (no exigen bultos).
-- Se puede ejecutar más de una vez.

-- 1) Permitir la categoría 'palet_completo' en pedido_bultos
alter table pedido_bultos drop constraint if exists pedido_bultos_categoria_check;
alter table pedido_bultos add constraint pedido_bultos_categoria_check
  check (categoria in (
    'carretillas','hormigoneras','cajas','bolsas','rollos',
    'tachos','packs','canos','otros','palet_completo'
  ));

-- 2) Función actualizada
create or replace function marcar_listo_para_entregar(
  p_pedido_id uuid,
  p_ubicacion text,
  p_bultos jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text := rol_actual();
  v_ubic text := upper(trim(coalesce(p_ubicacion, '')));
  v_especial boolean;
  v_estado_ant text;
  v_nombre text;
  v_bulto jsonb;
  v_cat text;
  v_cant integer;
  v_det text;
  v_total integer := 0;
begin
  if v_rol not in ('admin', 'encargado_expedicion', 'expedicion') then
    raise exception 'No tenés permiso para preparar pedidos.';
  end if;

  v_especial := v_ubic in ('MOSTRADOR', 'PALET COMPLETO');

  if not (v_especial or v_ubic ~ '^[1-3][ABC]$' or v_ubic ~ '^P[1-6]$') then
    raise exception 'Ubicación inválida.';
  end if;

  if p_bultos is null or jsonb_typeof(p_bultos) <> 'array' then
    p_bultos := '[]'::jsonb;
  end if;

  select estado into v_estado_ant
  from pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Pedido no encontrado.';
  end if;
  if v_estado_ant in ('entregado', 'cancelado') then
    raise exception 'El pedido ya está finalizado.';
  end if;

  delete from pedido_bultos where pedido_id = p_pedido_id;

  for v_bulto in select * from jsonb_array_elements(p_bultos) loop
    v_cat  := v_bulto->>'categoria';
    v_cant := coalesce((v_bulto->>'cantidad')::integer, 0);
    v_det  := nullif(trim(coalesce(v_bulto->>'detalle', '')), '');

    if v_cant <= 0 then
      continue;
    end if;
    if v_cat = 'otros' and v_det is null and not v_especial then
      raise exception 'Describí qué son los bultos de "Otros".';
    end if;

    insert into pedido_bultos (pedido_id, categoria, cantidad, detalle)
    values (p_pedido_id, v_cat, v_cant, v_det);
    v_total := v_total + v_cant;
  end loop;

  if v_total = 0 and not v_especial then
    raise exception 'Cargá al menos un bulto.';
  end if;

  update pedidos
     set estado = 'listo_para_entregar',
         hora_desde = null,
         ubicacion_retiro = v_ubic
   where id = p_pedido_id;

  select nombre into v_nombre from usuarios where id = auth.uid();

  insert into historial_pedidos
    (pedido_id, usuario_id, estado_anterior, estado_nuevo, descripcion)
  values (
    p_pedido_id,
    auth.uid(),
    v_estado_ant,
    'listo_para_entregar',
    coalesce(v_nombre, 'Expedición') || ' preparó el pedido en ' || v_ubic
      || case when v_total > 0 then ' · ' || v_total || ' bulto(s)' else '' end
  );
end;
$$;

revoke all on function marcar_listo_para_entregar(uuid, text, jsonb) from public, anon;
grant execute on function marcar_listo_para_entregar(uuid, text, jsonb) to authenticated;
