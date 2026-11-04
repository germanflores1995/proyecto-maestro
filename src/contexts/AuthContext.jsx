import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) cargarPerfil(session.user.id);
      else setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        if (session) cargarPerfil(session.user.id);
        else setLoading(false);
      } else if (event === "SIGNED_OUT") {
        setPerfil(null);
        setLoading(false);
      }
      // Ignoramos TOKEN_REFRESHED para no resetear la app innecesariamente
    });

    return () => subscription.unsubscribe();
  }, []);

  async function cargarPerfil(userId) {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("usuarios")
      .select("*")
      .eq("id", userId)
      .single();

    if (error || !data) {
      setError(
        "Tu usuario no tiene un perfil asignado. Contactá al administrador.",
      );
      setPerfil(null);
    } else if (!data.activo) {
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
