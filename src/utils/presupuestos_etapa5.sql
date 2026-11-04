-- =====================================================================
-- PRESUPUESTOS - ETAPA 5: próximo seguimiento y alertas
-- Idempotente: se puede ejecutar más de una vez.
-- Requiere haber ejecutado las etapas 1, 3 y 4.
-- =====================================================================

-- Programa (o quita, con null) la fecha del próximo seguimiento, sin cargar una gestión.
create or replace function public.programar_seguimiento_presupuesto(
  p_seguimiento_id uuid,
  p_fecha          timestamptz
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_cerrado  timestamptz;
  v_ciclo    integer;
begin
  select fecha_cierre, ciclo into v_cerrado, v_ciclo
  from public.presupuesto_seguimientos
  where id = p_seguimiento_id
  for update;

  if not found then
    raise exception 'El presupuesto no existe o no tenés acceso a él';
  end if;
  if v_cerrado is not null then
    raise exception 'El presupuesto está cerrado. Reabrilo para programar un seguimiento';
  end if;

  update public.presupuesto_seguimientos
  set proximo_seguimiento_at = p_fecha
  where id = p_seguimiento_id;

  insert into public.presupuesto_eventos (seguimiento_id, ciclo, tipo, usuario_id, detalle)
  values (p_seguimiento_id, v_ciclo, 'programacion', v_uid,
          jsonb_build_object('fecha', p_fecha));
end;
$$;

grant execute on function public.programar_seguimiento_presupuesto(uuid, timestamptz) to authenticated;
