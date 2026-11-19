-- Permite borrar los artículos de un pedido al cancelar su entrega
-- (solo admin y encargado de expedición). Se puede ejecutar más de una vez.
drop policy if exists "articulos_delete_cancelar_entrega" on public.pedido_articulos;
create policy "articulos_delete_cancelar_entrega"
  on public.pedido_articulos
  for delete
  to authenticated
  using (public.rol_actual() in ('admin', 'encargado_expedicion'));
