// Gestión de usuarios (solo administradores): alta, edición, activar/desactivar,
// cambio de contraseña. Usa la clave de servicio, que Supabase le da a la función.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ROLES = [
  "admin",
  "vendedor",
  "encargado_ventas",
  "expedicion",
  "encargado_expedicion",
  "caja",
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

class ErrorUsuario extends Error {}
const falla = (msg: string): never => {
  throw new ErrorUsuario(msg);
};


// Identifica al usuario que llama. Prueba tres caminos para no depender de uno solo.
async function identificar(
  admin: ReturnType<typeof createClient>,
  jwt: string,
  comoUsuario: ReturnType<typeof createClient>,
  motivos: string[],
): Promise<string | null> {
  // a) Preguntarle a Auth con la clave de servicio
  try {
    const { data, error } = await admin.auth.getUser(jwt);
    if (!error && data?.user) return data.user.id;
    if (error) motivos.push("servicio: " + error.message);
  } catch (e) {
    motivos.push("servicio: " + String(e));
  }

  // b) Preguntarle a Auth con el token del propio usuario
  try {
    const { data, error } = await comoUsuario.auth.getUser(jwt);
    if (!error && data?.user) return data.user.id;
    if (error) motivos.push("usuario: " + error.message);
  } catch (e) {
    motivos.push("usuario: " + String(e));
  }

  // c) Si la base acepta el token (verifica la firma), el usuario es el del token
  try {
    const { data, error } = await comoUsuario.rpc("rol_actual");
    if (!error && data) {
      const payload = JSON.parse(
        atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      if (payload?.sub && payload?.role === "authenticated") return payload.sub as string;
    }
    if (error) motivos.push("rol_actual: " + error.message);
    else if (!data) motivos.push("rol_actual: sin resultado");
  } catch (e) {
    motivos.push("base: " + String(e));
  }
  return null;
}

// Rol con el que actúa la clave de servicio (para diagnosticar permisos)
function rolDeClave(clave: string): string {
  try {
    const p = JSON.parse(atob(clave.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return String(p.role || "sin rol");
  } catch {
    return "no es un JWT (clave con otro formato)";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // 1) Quién llama: tiene que ser un administrador activo
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return json({ error: "Sesión inválida: falta iniciar sesión." }, 401);

    const comoUsuario = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") || "",
      {
        global: { headers: { Authorization: authHeader } },
        auth: { autoRefreshToken: false, persistSession: false },
      },
    );

    const motivos: string[] = [];
    const miId = await identificar(admin, jwt, comoUsuario, motivos);
    if (!miId) {
      console.error("No se pudo identificar al usuario:", motivos.join(" | "));
      return json(
        {
          error:
            "Sesión inválida. Cerrá sesión, volvé a entrar e intentá de nuevo. (" +
            motivos.join(" | ") +
            ")",
        },
        401,
      );
    }

    // Tiene que ser administrador activo. Se mira el perfil con la clave de servicio y,
    // si eso no alcanza, se le pregunta a la base con el token del propio usuario.
    let esAdmin = false;
    const razones: string[] = [];
    const { data: yo, error: errYo } = await admin
      .from("usuarios")
      .select("rol, activo")
      .eq("id", miId)
      .maybeSingle();
    if (errYo) razones.push("perfil: " + errYo.message);
    else if (!yo) razones.push("perfil: no encontrado");
    else if (yo.rol === "admin" && yo.activo) esAdmin = true;
    else razones.push(`perfil: rol=${yo.rol} activo=${yo.activo}`);

    if (!esAdmin) {
      const { data: rolBase, error: errRol } = await comoUsuario.rpc("rol_actual");
      if (!errRol && rolBase === "admin") esAdmin = true;
      else razones.push("rol_actual: " + (errRol ? errRol.message : String(rolBase)));
    }
    if (!esAdmin) {
      console.error("No es admin:", razones.join(" | "));
      return json(
        { error: "Solo un administrador puede gestionar usuarios. (" + razones.join(" | ") + ")" },
        403,
      );
    }

    const b = await req.json();
    const accion = b.action;

    // ---------- listar ----------
    if (accion === "listar") {
      const { data, error } = await admin
        .from("usuarios")
        .select("*")
        .order("nombre");
      if (error) falla(error.message);
      return json({ usuarios: data });
    }

    // ---------- crear ----------
    if (accion === "crear") {
      const nombre = String(b.nombre || "").trim();
      const email = String(b.email || "").trim().toLowerCase();
      const password = String(b.password || "");
      const rol = String(b.rol || "");
      if (!nombre) falla("Falta el nombre.");
      if (!/^\S+@\S+\.\S+$/.test(email)) falla("El email no es válido.");
      if (password.length < 8) falla("La contraseña debe tener al menos 8 caracteres.");
      if (!ROLES.includes(rol)) falla("Rol inválido.");

      const { data: nuevo, error: errCrear } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (errCrear || !nuevo?.user) {
        const m = errCrear?.message || "";
        falla(
          /already|registered|exists/i.test(m)
            ? "Ya existe un usuario con ese email."
            : m || "No se pudo crear el usuario.",
        );
      }
      const id = nuevo!.user.id;
      const { error: errPerfil } = await admin
        .from("usuarios")
        .upsert({ id, nombre, email, rol, activo: true });
      if (errPerfil) {
        await admin.auth.admin.deleteUser(id); // no dejar un acceso sin perfil
        falla("No se pudo guardar el perfil: " + errPerfil.message);
      }
      return json({ ok: true, id });
    }

    // Las acciones siguientes trabajan sobre un usuario existente
    const id = String(b.id || "");
    if (!id) falla("Falta el usuario.");

    // ---------- modificar (nombre, email, rol) ----------
    if (accion === "modificar") {
      const cambios: Record<string, unknown> = {};
      if (b.nombre !== undefined) {
        const nombre = String(b.nombre).trim();
        if (!nombre) falla("El nombre no puede quedar vacío.");
        cambios.nombre = nombre;
      }
      if (b.rol !== undefined) {
        if (!ROLES.includes(b.rol)) falla("Rol inválido.");
        if (id === miId && b.rol !== "admin") {
          falla("No podés sacarte a vos mismo el rol de administrador.");
        }
        cambios.rol = b.rol;
      }
      if (b.email !== undefined) {
        const email = String(b.email).trim().toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(email)) falla("El email no es válido.");
        const { error: errMail } = await admin.auth.admin.updateUserById(id, {
          email,
          email_confirm: true,
        });
        if (errMail) falla(errMail.message);
        cambios.email = email;
      }
      if (Object.keys(cambios).length) {
        const { error } = await admin.from("usuarios").update(cambios).eq("id", id);
        if (error) falla(error.message);
      }
      return json({ ok: true });
    }

    // ---------- activar / desactivar ----------
    if (accion === "activo") {
      const activo = !!b.activo;
      if (!activo && id === miId) falla("No podés desactivarte a vos mismo.");
      const { error } = await admin.from("usuarios").update({ activo }).eq("id", id);
      if (error) falla(error.message);
      // Además se bloquea (o libera) el ingreso a nivel de acceso
      const { error: errBan } = await admin.auth.admin.updateUserById(id, {
        ban_duration: activo ? "none" : "876000h",
      });
      if (errBan) falla(errBan.message);
      return json({ ok: true });
    }

    // ---------- contraseña ----------
    if (accion === "password") {
      const password = String(b.password || "");
      if (password.length < 8) falla("La contraseña debe tener al menos 8 caracteres.");
      const { error } = await admin.auth.admin.updateUserById(id, { password });
      if (error) falla(error.message);
      return json({ ok: true });
    }

    return json({ error: "Acción desconocida." }, 400);
  } catch (e) {
    if (e instanceof ErrorUsuario) {
      let msg = e.message;
      if (/permission denied/i.test(msg)) {
        msg += ` [rol de la clave de la función: ${rolDeClave(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "")}]`;
      }
      return json({ error: msg }, 400);
    }
    console.error(e);
    return json({ error: "Error interno. Probá de nuevo." }, 500);
  }
});
