-- Vendedor que cargó el pedido en Odoo (no el de esta app)
-- Idempotente.
alter table pedidos add column if not exists vendedor_odoo text;
