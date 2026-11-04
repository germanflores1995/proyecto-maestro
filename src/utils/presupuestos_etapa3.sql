-- =====================================================================
-- PRESUPUESTOS - ETAPA 3: registrar seguimiento
-- Idempotente: se puede ejecutar más de una vez.
-- Requiere haber ejecutado presupuestos_etapa1.sql.
-- =====================================================================

-- Registra una gestión, su evento en la línea de tiempo y actualiza
-- los contadores del presupuesto, todo en una sola transacción.
-- security invoker: se aplican las mismas reglas de acceso (RLS) que en las tablas.
create or replace function public.registrar_gestion_presupuesto(
  p_seguimiento_id      uuid,
  p_medio               text,
  p_resultado           text,
  p_persona             text        default null,
  p_situacion           text        default null,
  p_observaciones       text        default null,
  p_proximo_seguimiento timestamptz default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid          uuid := auth.uid();
  v_cierra_fecha timestamptz;
  v_ciclo        integer;
  v_efectivo     boolean;
  v_etiq_res     text;
  v_etiq_sit     text;
  v_gestion_id   uuid;
begin
  -- Bloquea la ficha mientras se registra la gestión
  select fecha_cierre, ciclo
    into v_cierra_fecha, v_ciclo
  from public.presupuesto_seguimientos
  where id = p_seguimiento_id
  for update;

  if not found then
    raise exception 'El presupuesto no existe o no tenés acceso a él';
  end if;

  if v_cierra_fecha is not null then
    raise exception 'El presupuesto está cerrado. Reabrilo para registrar nuevas gestiones';
  end if;

  if not exists (select 1 from public.presupuesto_catalogos
                 where tipo = 'medio' and clave = p_medio and activo) then
    raise exception 'Medio de contacto inválido';
  end if;

  select efectivo, etiqueta into v_efectivo, v_etiq_res
  from public.presupuesto_catalogos
  where tipo = 'resultado' and clave = p_resultado and activo;

  if not found then
    raise exception 'Resultado inválido';
  end if;

  if p_situacion is not null then
    select etiqueta into v_etiq_sit
    from public.presupuesto_catalogos
    where tipo = 'situacion' and clave = p_situacion and activo;
    if not found then
      raise exception 'Situación inválida';
    end if;
  end if;

  insert into public.presupuesto_gestiones (
    seguimiento_id, ciclo, usuario_id, medio, resultado, efectivo,
    persona_contactada, situacion, observaciones, proximo_seguimiento_at
  ) values (
    p_seguimiento_id, v_ciclo, v_uid, p_medio, p_resultado, v_efectivo,
    nullif(trim(p_persona), ''), p_situacion, nullif(trim(p_observaciones), ''),
    p_proximo_seguimiento
  )
  returning id into v_gestion_id;

  insert into public.presupuesto_eventos (
    seguimiento_id, ciclo, tipo, gestion_id, usuario_id, detalle
  ) values (
    p_seguimiento_id, v_ciclo, 'gestion', v_gestion_id, v_uid,
    jsonb_build_object('medio', p_medio, 'resultado', p_resultado)
  );

  update public.presupuesto_seguimientos
  set ultimo_intento_at           = now(),
      ultimo_contacto_efectivo_at = case when v_efectivo then now()
                                         else ultimo_contacto_efectivo_at end,
      proximo_seguimiento_at      = p_proximo_seguimiento,
      ultima_gestion_resumen      = v_etiq_res
                                    || coalesce(' · ' || v_etiq_sit, '')
  where id = p_seguimiento_id;

  return v_gestion_id;
end;
$$;

grant execute on function public.registrar_gestion_presupuesto(uuid, text, text, text, text, text, timestamptz) to authenticated;
