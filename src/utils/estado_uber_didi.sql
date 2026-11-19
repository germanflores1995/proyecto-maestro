-- NUEVO: agrega el estado "uber_didi" a los estados permitidos de la tabla pedidos.
-- Dónde: Supabase > SQL Editor > pegar y ejecutar (Run). Hacerlo DESPUÉS de reemplazar constants.js.
-- No modifica ningún dato ni la columna "facturado".

alter table public.pedidos drop constraint pedidos_estado_check;

alter table public.pedidos add constraint pedidos_estado_check
  check (estado = any (array[
    'en_espera', 'en_camino', 'uber_didi', 'viene_hoy', 'retira_manana',
    'retira_otro_dia', 'listo_para_entregar', 'entregado', 'cancelado'
  ]::text[]));
