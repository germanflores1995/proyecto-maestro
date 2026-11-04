-- =====================================================================
-- PRESUPUESTOS - ETAPA 4: estados, cierres, reapertura y anulación
-- Idempotente: se puede ejecutar más de una vez.
-- Requiere haber ejecutado presupuestos_etapa1.sql y presupuestos_etapa3.sql.
-- =====================================================================

-- ---------- 1. Cambiar estado (solo estados que no cierran) ----------
create or replace function public.cambiar_estado_presupuesto(
  p_seguimiento_id uuid,
  p_estado         text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_actual    text;
  v_cierrado  timestamptz;
  v_ciclo     integer;
  v_cierra    boolean;
begin
  select estado, fecha_cierre, ciclo into v_actual, v_cierrado, v_ciclo
  from public.presupuesto_seguimientos
  where id = p_seguimiento_id
  for update;

  if not found then
    raise exception 'El presupuesto no existe o no tenés acceso a él';
  end if;
  if v_cierrado is not null then
    raise exception 'El presupuesto está cerrado. Reabrilo para cambiar el estado';
  end if;

  select cierra into v_cierra from public.presupuesto_estados where clave = p_estado;
  if not found or v_cierra then
    raise exception 'Estado inválido. Para cerrar el presupuesto usá Confirmar, Perder o Cerrar sin resultado';
  end if;
  if v_actual = p_estado then
    return;
  end if;

  update public.presupuesto_seguimientos
  set estado = p_estado
  where id = p_seguimiento_id;

  insert into public.presupuesto_eventos (seguimiento_id, ciclo, tipo, usuario_id, detalle)
  values (p_seguimiento_id, v_ciclo, 'cambio_estado', v_uid,
          jsonb_build_object('desde', v_actual, 'hacia', p_estado));
end;
$$;

-- ---------- 2. Cerrar: confirmado, perdido o cerrado sin resultado ----------
create or replace function public.cerrar_presupuesto(
  p_seguimiento_id uuid,
  p_tipo           text,              -- 'confirmado' | 'perdido' | 'sin_resultado'
  p_referencia_oc  text        default null,
  p_importe        numeric     default null,
  p_motivo         text        default null,   -- clave de motivo_perdida (solo perdido)
  p_observaciones  text        default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid         uuid := auth.uid();
  v_cierrado    timestamptz;
  v_ciclo       integer;
  v_importe     numeric;
  v_estado      text;
  v_tipo_evento text;
begin
  select fecha_cierre, ciclo, importe_original
    into v_cierrado, v_ciclo, v_importe
  from public.presupuesto_seguimientos
  where id = p_seguimiento_id
  for update;

  if not found then
    raise exception 'El presupuesto no existe o no tenés acceso a él';
  end if;
  if v_cierrado is not null then
    raise exception 'El presupuesto ya está cerrado';
  end if;

  if p_tipo = 'confirmado' then
    if nullif(trim(p_referencia_oc), '') is null then
      raise exception 'Para confirmar hay que cargar el número de orden de compra';
    end if;
    v_estado := 'confirmado';
    v_tipo_evento := 'confirmacion';
  elsif p_tipo = 'perdido' then
    if not exists (select 1 from public.presupuesto_catalogos
                   where tipo = 'motivo_perdida' and clave = p_motivo and activo) then
      raise exception 'Elegí el motivo de la pérdida';
    end if;
    v_estado := 'perdido';
    v_tipo_evento := 'perdida';
  elsif p_tipo = 'sin_resultado' then
    v_estado := 'cerrado_sin_resultado';
    v_tipo_evento := 'cierre';
  else
    raise exception 'Tipo de cierre inválido';
  end if;

  update public.presupuesto_seguimientos
  set estado            = v_estado,
      fecha_cierre      = now(),
      cerrado_por       = v_uid,
      tipo_cierre       = p_tipo,
      importe_confirmado = case when p_tipo = 'confirmado'
                                then coalesce(p_importe, v_importe) end,
      referencia_oc     = case when p_tipo = 'confirmado' then trim(p_referencia_oc) end,
      motivo_perdida    = case when p_tipo = 'perdido' then p_motivo end,
      observaciones_cierre = nullif(trim(p_observaciones), '')
  where id = p_seguimiento_id;

  insert into public.presupuesto_eventos (seguimiento_id, ciclo, tipo, usuario_id, detalle)
  values (p_seguimiento_id, v_ciclo, v_tipo_evento, v_uid,
          jsonb_build_object('estado', v_estado,
                             'referencia_oc', nullif(trim(p_referencia_oc), ''),
                             'motivo', p_motivo));
end;
$$;

-- ---------- 3. Reabrir: misma ficha, nuevo ciclo ----------
create or replace function public.reabrir_presupuesto(
  p_seguimiento_id uuid,
  p_estado         text default 'en_seguimiento'
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_cierrado  timestamptz;
  v_ciclo     integer;
  v_nuevo     integer;
begin
  select fecha_cierre, ciclo into v_cierrado, v_ciclo
  from public.presupuesto_seguimientos
  where id = p_seguimiento_id
  for update;

  if not found then
    raise exception 'El presupuesto no existe o no tenés acceso a él';
  end if;
  if v_cierrado is null then
    raise exception 'El presupuesto no está cerrado';
  end if;
  if exists (select 1 from public.presupuesto_estados where clave = p_estado and cierra) then
    raise exception 'Estado inválido para reabrir';
  end if;

  v_nuevo := v_ciclo + 1;

  update public.presupuesto_seguimientos
  set estado        = p_estado,
      fecha_cierre  = null,
      cerrado_por   = null,
      ciclo         = v_nuevo,
      proximo_seguimiento_at = null
  where id = p_seguimiento_id;

  insert into public.presupuesto_eventos (seguimiento_id, ciclo, tipo, usuario_id, detalle)
  values (p_seguimiento_id, v_nuevo, 'reapertura', v_uid,
          jsonb_build_object('ciclo_anterior', v_ciclo, 'estado', p_estado));
end;
$$;

-- ---------- 4. Anular una gestión (solo encargado de ventas o admin) ----------
-- Las gestiones siguen siendo inmutables: esta es la única modificación permitida,
-- y solo toca los campos de anulación. Los contadores se recalculan sin la gestión anulada.
create or replace function public.pges_solo_anulacion()
returns trigger
language plpgsql
as $$
begin
  if new.id                     is distinct from old.id
  or new.seguimiento_id         is distinct from old.seguimiento_id
  or new.ciclo                  is distinct from old.ciclo
  or new.ocurrio_at             is distinct from old.ocurrio_at
  or new.usuario_id             is distinct from old.usuario_id
  or new.medio                  is distinct from old.medio
  or new.resultado              is distinct from old.resultado
  or new.efectivo               is distinct from old.efectivo
  or new.persona_contactada     is distinct from old.persona_contactada
  or new.situacion              is distinct from old.situacion
  or new.observaciones          is distinct from old.observaciones
  or new.proxima_accion         is distinct from old.proxima_accion
  or new.proximo_seguimiento_at is distinct from old.proximo_seguimiento_at then
    raise exception 'Las gestiones no se pueden modificar, solo anular';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pges_solo_anulacion on public.presupuesto_gestiones;
create trigger trg_pges_solo_anulacion
  before update on public.presupuesto_gestiones
  for each row execute function public.pges_solo_anulacion();

create or replace function public.anular_gestion_presupuesto(
  p_gestion_id uuid,
  p_motivo     text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_rol       text;
  v_seg       uuid;
  v_ciclo     integer;
  v_anulada   boolean;
  v_intento   timestamptz;
  v_efectivo  timestamptz;
  v_resumen   text;
begin
  select rol into v_rol from public.usuarios where id = v_uid and activo;
  if v_rol not in ('encargado_ventas', 'admin') then
    raise exception 'Solo el encargado de ventas o el admin pueden anular gestiones';
  end if;
  if nullif(trim(p_motivo), '') is null then
    raise exception 'Escribí el motivo de la anulación';
  end if;

  select seguimiento_id, ciclo, anulada into v_seg, v_ciclo, v_anulada
  from public.presupuesto_gestiones
  where id = p_gestion_id;

  if not found then
    raise exception 'La gestión no existe';
  end if;
  if v_anulada then
    raise exception 'La gestión ya está anulada';
  end if;

  update public.presupuesto_gestiones
  set anulada = true,
      anulada_por = v_uid,
      anulada_at = now(),
      anulada_motivo = trim(p_motivo)
  where id = p_gestion_id;

  -- Recalcula los contadores con las gestiones que quedan vigentes
  select max(ocurrio_at),
         max(ocurrio_at) filter (where efectivo)
    into v_intento, v_efectivo
  from public.presupuesto_gestiones
  where seguimiento_id = v_seg and not anulada;

  select c.etiqueta || coalesce(' · ' || s.etiqueta, '')
    into v_resumen
  from public.presupuesto_gestiones g
  join public.presupuesto_catalogos c on c.tipo = 'resultado' and c.clave = g.resultado
  left join public.presupuesto_catalogos s on s.tipo = 'situacion' and s.clave = g.situacion
  where g.seguimiento_id = v_seg and not g.anulada
  order by g.ocurrio_at desc
  limit 1;

  update public.presupuesto_seguimientos
  set ultimo_intento_at           = v_intento,
      ultimo_contacto_efectivo_at = v_efectivo,
      ultima_gestion_resumen      = v_resumen
  where id = v_seg;

  insert into public.presupuesto_eventos (seguimiento_id, ciclo, tipo, gestion_id, usuario_id, detalle)
  values (v_seg, v_ciclo, 'anulacion', p_gestion_id, v_uid,
          jsonb_build_object('motivo', trim(p_motivo)));
end;
$$;

-- ---------- Permisos ----------
grant execute on function public.cambiar_estado_presupuesto(uuid, text) to authenticated;
grant execute on function public.cerrar_presupuesto(uuid, text, text, numeric, text, text) to authenticated;
grant execute on function public.reabrir_presupuesto(uuid, text) to authenticated;
grant execute on function public.anular_gestion_presupuesto(uuid, text) to authenticated;
