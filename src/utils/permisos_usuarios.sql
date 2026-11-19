-- Devuelve a la función de gestión de usuarios el permiso sobre la tabla usuarios.
-- (La clave de servicio no necesita RLS, pero sí permisos de tabla.) Se puede correr más de una vez.
grant usage on schema public to service_role;
grant all on table public.usuarios to service_role;

-- Para revisar qué permisos tiene hoy cada rol sobre la tabla (opcional):
-- select grantee, privilege_type from information_schema.role_table_grants
--  where table_schema = 'public' and table_name = 'usuarios' order by grantee, privilege_type;
