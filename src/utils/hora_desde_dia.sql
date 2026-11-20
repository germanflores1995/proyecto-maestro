-- Día para el que se eligió la hora de «Viene hoy» / «Retira mañana».
-- Así, una hora elegida para un día que ya pasó (ej. «viene hoy» de ayer que no vino) deja de mostrarse.
alter table public.pedidos add column if not exists hora_desde_dia date;

-- Relleno de los pedidos que ya tienen hora: se toma el día de su último movimiento
-- (para «Retira mañana», el día siguiente; sábado y domingo → lunes).
update public.pedidos p
set hora_desde_dia = s.d + case
      when p.estado = 'retira_manana' then (case extract(dow from s.d) when 6 then 2 else 1 end)
      else 0
    end
from (
  select p2.id,
         (coalesce(
            (select max(h.created_at) from public.historial_pedidos h where h.pedido_id = p2.id),
            p2.created_at
          ) at time zone 'America/Argentina/Buenos_Aires')::date as d
  from public.pedidos p2
  where p2.hora_desde is not null
) s
where p.id = s.id;
