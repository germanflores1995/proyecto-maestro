import { createContext, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Usuario cuyo perfil ya está cargado (o cargándose). Sirve para no recargar
  // toda la app cuando Supabase repite el aviso de sesión al volver a la pestaña.
  const perfilIdRef = useRef(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) cargarPerfil(session.user.id);
      else setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nuevaSesion) => {
      // Misma sesión: no se vuelve a renderizar nada si solo cambió el token
      setSession((prev) =>
        prev?.access_token === nuevaSesion?.access_token ? prev : nuevaSesion,
      );
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        if (!nuevaSesion) {
          setLoading(false);
        } else if (perfilIdRef.current !== nuevaSesion.user.id) {
          // Usuario nuevo: se carga su perfil (fuera del callback, como pide supabase-js)
          setTimeout(() => cargarPerfil(nuevaSesion.user.id), 0);
        }
        // Si es el mismo usuario (volviste a la pestaña): no se hace nada
      } else if (event === "SIGNED_OUT") {
        perfilIdRef.current = null;
        setPerfil(null);
        setLoading(false);
      }
      // TOKEN_REFRESHED y demás: se ignoran para no resetear la app
    });

    return () => subscription.unsubscribe();
  }, []);

  async function cargarPerfil(userId) {
    if (perfilIdRef.current === userId) return; // ya cargado o en curso
    perfilIdRef.current = userId;
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("usuarios")
      .select("*")
      .eq("id", userId)
      .single();

    if (error || !data) {
      perfilIdRef.current = null;
      setError(
        "Tu usuario no tiene un perfil asignado. Contactá al administrador.",
      );
      setPerfil(null);
    } else if (!data.activo) {
      perfilIdRef.current = null;
      setError("Tu usuario está desactivado. Contactá al administrador.");
      setPerfil(null);
    } else {
      setPerfil(data);
    }
    setLoading(false);
  }

  async function login(email, password) {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  }

  async function logout() {
    await supabase.auth.signOut();
    perfilIdRef.current = null;
    setPerfil(null);
  }

  const rol = perfil?.rol;
  const esAdmin = rol === "admin";
  const esExpedicion =
    rol === "expedicion" || rol === "encargado_expedicion" || rol === "admin";
  const esVendedor = rol === "vendedor" || rol === "encargado_ventas";
  const esCaja = rol === "caja" || rol === "admin";
  const esEncargadoVentas = rol === "encargado_ventas" || rol === "admin";
  const esEncargadoExpedicion =
    rol === "encargado_expedicion" || rol === "admin";
  const puedeGestionarPedidos =
    rol === "expedicion" || rol === "encargado_expedicion" || rol === "admin";
  const puedeVerMetricas =
    rol === "encargado_ventas" ||
    rol === "encargado_expedicion" ||
    rol === "admin";
  const puedeExportarExcel = rol === "encargado_expedicion" || rol === "admin";

  return (
    <AuthContext.Provider
      value={{
        session,
        perfil,
        loading,
        error,
        login,
        logout,
        esAdmin,
        esExpedicion,
        esVendedor,
        esCaja,
        puedeGestionarPedidos,
        esEncargadoVentas,
        esEncargadoExpedicion,
        puedeVerMetricas,
        puedeExportarExcel,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
