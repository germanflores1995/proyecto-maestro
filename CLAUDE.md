# PROYECTO.md — Distribuidora Maestro S.R.L.

## App de Gestión Interna

---

## Descripción general

App web interna para la gestión de operaciones de **Distribuidora Maestro S.R.L.** (distribuidora de pinturería, electricidad y afines). Diseñada para ser escalable y crecer modularmente. Se recomienda comenzar el desarrollo desde cero con este documento como base.

---

## Stack tecnológico

- **Frontend:** React + Vite
- **Base de datos:** Supabase (PostgreSQL + Realtime)
- **Hosting:** Vercel
- **Edge Functions:** Supabase (para integración con Odoo sin CORS)
- **ERP:** Odoo (`https://live.distribuidoramaestro.com`)

---

## Identidad visual

quiero se sigas los patrones de diseño que estan en la carpeta :Styles

- **Logo:** Distribuidora Maestro S.R.L. (archivo: `public/logo.png`)
- **Color primario:** azul eléctrico `#1565C0`
- **Color de acento:** azul claro `#1E88E5`
- **Tema oscuro:** fondo `#0A0A0A`, secundario `#1A1A1A`, texto `#F0F0F0`
- **Tema claro:** fondo `#F5F5F5`, secundario `#FFFFFF`, texto `#1A1A1A`
- **Toggle de tema:** botón visible en el header para cambiar entre oscuro y claro
- **Tipografía:** Barlow / Barlow Condensed (Google Fonts)

---

## Roles de usuario

| Rol          | Descripción                                                                                                                                                                                                                                           |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin`      | Acceso total. Gestión de usuarios y clientes.                                                                                                                                                                                                         |
| `expedicion` | Gestiona pedidos, cambia estados, marca controlados y entregados, exporta Excel.                                                                                                                                                                      |
| `vendedor`   | Carga pedidos y hace seguimiento, cambia estado de pedidos (no pueden poner listo para entregar ni tampoco entregado, solo pueden poner en espera, en camino, viene hoy, retira mañana). Por defecto ve solo los suyos, puede filtrar para ver todos. |
| `caja`       | 🔜 Planificado — visualización de devoluciones pendientes                                                                                                                                                                                             |
| `viajante`   | 🔜 Planificado — vendedores externos, carga desde celular                                                                                                                                                                                             |

---

## Estados de pedido (orden de prioridad estricto)

| Prioridad | Clave                 | Etiqueta               | Descripción                                      |
| --------- | --------------------- | ---------------------- | ------------------------------------------------ |
| 1         | `en_espera`           | ⚡ En espera           | Cliente presente en el local esperando su pedido |
| 2         | `en_camino`           | 🚗 En camino           | Cliente en camino, próximo a retirar             |
| 3         | `viene_hoy`           | 📅 Viene hoy           | Confirmado que viene hoy                         |
| 4         | `retira_manana`       | 📆 Retira mañana       | Confirmado para mañana                           |
| 5         | `retira_otro_dia`     | 📋 Retira otro día     | Sin fecha definida                               |
| 6         | `listo_para_entregar` | ✅ Listo para entregar | Expedición controló el pedido                    |
| 7         | `entregado`           | 📦 Entregado           | Retirado por el cliente, sale de lista activa    |

**Regla:** los pedidos se ordenan SIEMPRE por prioridad de estado, nunca por fecha de carga.

---

## Campos de cada pedido

| Campo           | Tipo        | Descripción                                           |
| --------------- | ----------- | ----------------------------------------------------- |
| `id`            | uuid        | Generado automáticamente                              |
| `numero_pedido` | text        | Número de pedido del sistema Odoo                     |
| `cliente_id`    | uuid        | FK a tabla clientes                                   |
| `vendedor_id`   | uuid        | FK a tabla usuarios                                   |
| `estado`        | text        | Ver tabla de estados                                  |
| `pago`          | text        | `paga_ahora` o `solo_retira`                          |
| `facturado`     | boolean     | true = facturado                                      |
| `observaciones` | text        | Texto libre, opcional                                 |
| `monto`         | numeric     | Traído de Odoo AL MOMENTO de marcar como entregado    |
| `activo`        | boolean     | false cuando fue entregado                            |
| `created_at`    | timestamptz | Automático al crear (muestra fecha y hora)            |
| `entregado_at`  | timestamptz | Automático al marcar entregado (muestra fecha y hora) |

**Nota importante sobre el monto:** el monto se consulta a Odoo únicamente cuando el pedido es marcado como "Entregado", ya que antes puede sufrir cambios (agregar o quitar artículos). Así se garantiza que el monto exportado en el Excel es el valor final real.

---

## Vistas de la aplicación

### 1. Login

- Pantalla inicial con logo DM centrado
- Diseño impresionante y profesional
- Campos: email y contraseña
- Según el rol del usuario, redirige a su vista correspondiente

### 2. Vista Vendedor

Secciones visibles:

- **Pendientes de controlar** — pedidos sin controlar (en cualquier estado activo, sin marcar como listo)
- **Listos para entregar** — pedidos que expedición ya controló
- **Retirados hoy** — pedidos entregados en el día

Filtros disponibles:

- Por defecto: solo mis pedidos
- Toggle para ver todos los pedidos
- Por estado
- Por fecha

Vista:

- Podra ver por viñetas
- Por lista detallada

Ordenamiento:

- Por prioridad (default)
- Por hora de carga
- Por cliente (alfabético)

Acciones:

- Cargar nuevo pedido (botón flotante)
- Ver detalle de cada pedido con historial de movimientos

### 3. Formulario de carga de pedido

Campos:

- Número de pedido (texto)
- Cliente (autocompletado desde lista precargada, o búsqueda en Odoo)
- Estado inicial (selector visual con los estados disponibles para vendedor)
- Facturado / No facturado (toggle)
- Paga ahora / Solo retira (toggle)
- Observaciones (texto libre, opcional)

Fecha y hora de carga: automática, no editable.

### 4. Vista Expedición

Similar a la vista vendedor pero con más controles:

- Ve TODOS los pedidos de todos los vendedores
- Ordenados por prioridad
- Puede cambiar cualquier estado
- Puede marcar como "Listo para entregar"
- Puede marcar como "Entregado" (en ese momento se consulta el monto a Odoo)
- Ve reporte del día con total de pedidos entregados

Filtros disponibles:

- Por vendedor
- Por estado
- Por fecha
- Por cliente
- Numero de pedido (para busqueda, por ejemplo colocar ultimos digitos del numero de pedido para q realize una busqueda de un pedido especifico)

Ordenamiento:

- Por prioridad (default)
- Por hora de carga
- Por cliente
- Por vendedor

### 5. Detalle de pedido (modal)

- Datos completos del pedido
- Historial de movimientos con fecha y hora de cada cambio (quién hizo qué y cuándo)
- Botones de cambio de estado según el rol del usuario

### 6. Exportación Excel (fin de día)

Columnas exportadas:

- N° de pedido
- Cliente
- Vendedor
- Hora de entrega
- Monto (traído de Odoo al momento de entrega)

Al pie: total de pedidos y suma total de montos del día.

### 7. Panel Admin

- Gestión de usuarios (alta, desactivar, ver listado)
- Importación de clientes desde Excel
- Toggle de confirmación de email desactivado en Supabase

---

## Historial de movimientos

Cada cambio de estado genera un registro con:

- Quién hizo el cambio (nombre del usuario)
- Estado anterior y estado nuevo
- Fecha y hora exacta del cambio

Se muestra en el detalle de cada pedido en orden cronológico.

---

## Notificaciones push

- Solo para rol `expedicion`
- Se disparan cuando un pedido cambia a `en_espera`
- Funcionan aunque la pestaña esté cerrada (Service Worker)
- Al primer ingreso se solicita permiso al usuario

---

## Integración con Odoo

**Objetivo:** traer el monto final del pedido al momento de marcarlo como entregado.

**Método:** Edge Function de Supabase (resuelve el problema de CORS).

- Función: `obtener-monto-odoo`
- Flujo: app → Edge Function → Odoo API (JSON-RPC) → devuelve monto
- Se consulta el modelo `sale.order` filtrando por número de pedido
- Campo traído: `amount_total`

**Datos de conexión Odoo:**

- URL: `https://live.distribuidoramaestro.com`
- DB: `live`
- Usuario API: `expedicion`
- API Key: [guardada como secret en Supabase]

**Deploy de Edge Function:** requiere Docker Desktop instalado y corriendo.
Comando: `supabase functions deploy obtener-monto-odoo`

---

## Tablas en Supabase

```sql
-- Usuarios
create table public.usuarios (
  id uuid references auth.users(id) primary key,
  nombre text not null,
  email text not null,
  rol text not null check (rol in ('admin', 'expedicion', 'vendedor')),
  activo boolean default true,
  created_at timestamptz default now()
);

-- Clientes (importados desde Excel)
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
    estado in ('en_espera','en_camino','viene_hoy','retira_manana','retira_otro_dia','listo_para_entregar','entregado')
  ),
  pago text not null check (pago in ('paga_ahora','solo_retira')),
  facturado boolean default false,
  observaciones text,
  monto numeric,
  activo boolean default true,
  created_at timestamptz default now(),
  entregado_at timestamptz
);

-- Historial de movimientos
create table public.historial_pedidos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid references public.pedidos(id),
  usuario_id uuid references public.usuarios(id),
  estado_anterior text,
  estado_nuevo text,
  descripcion text,
  created_at timestamptz default now()
);

-- Suscripciones push
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references public.usuarios(id),
  subscription jsonb not null,
  created_at timestamptz default now()
);

-- Permisos
grant all on public.usuarios to anon, authenticated;
grant all on public.clientes to anon, authenticated;
grant all on public.pedidos to anon, authenticated;
grant all on public.historial_pedidos to anon, authenticated;
grant all on public.push_subscriptions to anon, authenticated;
```

---

## Módulo futuro — Devoluciones / Notas de crédito 🔜

Gestión de devoluciones conectada a Odoo.

**Funcionalidades previstas:**

- Expedición lee el pedido original desde Odoo por número
- Selecciona artículos a devolver
- Genera nota de crédito directamente en Odoo
- Nuevo rol "Caja" puede ver pedidos con devoluciones pendientes y artículos involucrados

---

## Variables de entorno (.env)

```
VITE_SUPABASE_URL=https://ykpgjjenkziorfhmunia.supabase.co
VITE_SUPABASE_ANON_KEY= sb_publishable_Z7mduRd-IWFgwE9aNZYvtg_OUOPfF6P
```

---

## Comandos clave

```bash
# Correr en local
npm run dev

# Publicar cambios en producción
vercel --prod

# Deployar Edge Function (requiere Docker)
supabase functions deploy obtener-monto-odoo
```

---

## Reglas de negocio importantes

1. Los pedidos se ordenan SIEMPRE por prioridad de estado, no por fecha
2. `en_espera` es siempre el primero, sin excepción
3. Un pedido entregado desaparece de la lista activa pero se conserva en la base
4. Solo `expedicion` y `admin` pueden marcar `listo_para_entregar` y `entregado`
5. Los vendedores NO pueden retroceder un pedido desde `listo_para_entregar`
6. El `vendedor_id` se asigna automáticamente al usuario logueado al crear el pedido
7. `created_at` y `entregado_at` son siempre automáticos, nunca editables
8. El monto se trae de Odoo SOLO al momento de marcar como entregado
9. Un usuario desactivado no puede iniciar sesión
10. La base de clientes solo la puede modificar el `admin`
11. Las notificaciones push solo se envían a usuarios con rol `expedicion`
12. El vendedor ve solo sus pedidos por defecto, puede filtrar para ver todos
13. Cada cambio de estado genera un registro en historial con fecha y hora exacta
14. El Excel de fin de día incluye monto de Odoo y suma total al pie
