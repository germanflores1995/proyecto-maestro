-- ============================================================
-- MAESTRO APP — Schema SQL completo (Supabase / PostgreSQL)
-- Incluye: usuarios (4 roles), clientes, pedidos, pedido_articulos,
-- historial_pedidos, devoluciones, devolucion_articulos, push_subscriptions
-- ============================================================

-- Usuarios (extiende auth.users de Supabase)
create table public.usuarios (
  id uuid references auth.users(id) primary key,
  nombre text not null,
  email text not null,
  rol text not null check (rol in ('admin', 'expedicion', 'vendedor', 'caja')),
  activo boolean default true,
  created_at timestamptz default now()
);

-- Clientes (carga manual + importación opcional por Excel)
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  codigo text,
  activo boolean default true,
  created_at timestamptz default now()
);

-- Pedidos
create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  numero_pedido text not null,
  cliente_id uuid references public.clientes(id),
  vendedor_id uuid references public.usuarios(id),
  estado text not null default 'viene_hoy' check (
    estado in ('en_espera','en_camino','viene_hoy','retira_manana','listo_para_entregar','retira_otro_dia','entregado')
  ),
  pago text not null check (pago in ('paga_ahora','solo_retira')),
  facturado boolean default false,
  observaciones text,
  monto numeric,
  activo boolean default true,
  created_at timestamptz default now(),
  entregado_at timestamptz
);

-- Detalle de artículos del pedido (snapshot de Odoo al momento de la entrega)
create table public.pedido_articulos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid references public.pedidos(id) on delete cascade,
  codigo text,
  descripcion text not null,
  cantidad numeric not null,
  precio_unitario numeric not null,
  subtotal numeric not null,
  created_at timestamptz default now()
);

-- Historial de movimientos por pedido
create table public.historial_pedidos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid references public.pedidos(id) on delete cascade,
  usuario_id uuid references public.usuarios(id),
  estado_anterior text,
  estado_nuevo text,
  descripcion text,
  created_at timestamptz default now()
);

-- Devoluciones (gestión interna, sin escritura en Odoo)
create table public.devoluciones (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid references public.pedidos(id),
  usuario_id uuid references public.usuarios(id),
  motivo text not null check (motivo in ('nota_credito', 'cambio')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'procesada')),
  observaciones text,
  created_at timestamptz default now(),
  procesada_at timestamptz,
  procesada_por uuid references public.usuarios(id)
);

-- Artículos incluidos en cada devolución
create table public.devolucion_articulos (
  id uuid primary key default gen_random_uuid(),
  devolucion_id uuid references public.devoluciones(id) on delete cascade,
  pedido_articulo_id uuid references public.pedido_articulos(id),
  codigo text,
  descripcion text not null,
  cantidad numeric not null,
  precio_unitario numeric not null,
  subtotal numeric not null
);

-- Suscripciones push (notificaciones para expedición)
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references public.usuarios(id),
  subscription jsonb not null,
  created_at timestamptz default now()
);

-- ============================================================
-- Permisos (RLS deshabilitado + grants directos, mismo esquema
-- que terminó funcionando en el proyecto anterior)
-- ============================================================
alter table public.usuarios disable row level security;
alter table public.clientes disable row level security;
alter table public.pedidos disable row level security;
alter table public.pedido_articulos disable row level security;
alter table public.historial_pedidos disable row level security;
alter table public.devoluciones disable row level security;
alter table public.devolucion_articulos disable row level security;
alter table public.push_subscriptions disable row level security;

grant all on public.usuarios to anon, authenticated;
grant all on public.clientes to anon, authenticated;
grant all on public.pedidos to anon, authenticated;
grant all on public.pedido_articulos to anon, authenticated;
grant all on public.historial_pedidos to anon, authenticated;
grant all on public.devoluciones to anon, authenticated;
grant all on public.devolucion_articulos to anon, authenticated;
grant all on public.push_subscriptions to anon, authenticated;

-- ============================================================
-- Habilitar Realtime en pedidos (para que todos los usuarios
-- vean los cambios de estado al instante)
-- ============================================================
alter publication supabase_realtime add table public.pedidos;
