import { useState, useEffect, lazy } from "react";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Login from "./components/Auth/Login";
import Sidebar from "./components/Layout/Sidebar";
import { ALTURA_NAV } from "./components/Layout/Sidebar";
import Header from "./components/Layout/Header";
import VendedorView from "./components/Vendedor/VendedorView";
import ExpedicionView from "./components/Expedicion/ExpedicionView";
import DevolucionesView from "./components/Devoluciones/DevolucionesView";
import CajaView from "./components/Caja/CajaView";
import CajaNotasCredito from "./components/Devoluciones/CajaNotasCredito";
import AdminPanel from "./components/Admin/AdminPanel";
import MetricasView from "./components/Metricas/MetricasView";
import FormularioPedido from "./components/Pedidos/FormularioPedido";
import PresupuestosView from "./components/Presupuestos/PresupuestosView";
import ObjetivoView from "./components/Metricas/ObjetivoView";
import SeccionSegura from "./components/Validacion/SeccionSegura";
import AvisosToast from "./components/Avisos/AvisosToast";
import useAvisosPedidos from "./hooks/useAvisosPedidos";

// Sección en prueba (solo administrador): se descarga recién cuando se entra a ella
const ValidarSalidasView = lazy(
  () => import("./components/Validacion/ValidarSalidasView"),
);

function paginaPorDefecto({ esVendedor, esExpedicion, esCaja, esAdmin }) {
  if (esVendedor) return "vendedor";
  if (esExpedicion) return "expedicion";
  if (esCaja) return "caja";
  if (esAdmin) return "admin";
  return "vendedor";
}

function AppShell() {
  const {
    session,
    perfil,
    loading,
    error,
    logout,
    esVendedor,
    esExpedicion,
    esCaja,
    esAdmin,
  } = useAuth();
  const [pagina, setPagina] = useState(null);
  // Sonido y carteles de aviso de pedidos (en espera / listo para entregar)
  const { carteles, cerrar: cerrarCartel } = useAvisosPedidos();

  const [sidebarAbierto, setSidebarAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [notifActivas, setNotifActivas] = useState(false);
  const [refrescarKey, setRefrescarKey] = useState(0);

  useEffect(() => {
    if (perfil && !pagina) {
      setPagina(
        paginaPorDefecto({ esVendedor, esExpedicion, esCaja, esAdmin }),
      );
    }
  }, [perfil]);

  const solicitarNotificaciones = async () => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
      setNotifActivas(true);
      return;
    }
    const perm = await Notification.requestPermission();
    setNotifActivas(perm === "granted");
  };

  useEffect(() => {
    if (
      esExpedicion &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      setNotifActivas(true);
    }
  }, [esExpedicion]);

  // La pantalla de carga completa solo aparece al abrir la app o iniciar sesión,
  // nunca una vez que ya hay un usuario adentro.
  if (loading && !perfil) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          flexDirection: "column",
          gap: 12,
          background: "var(--bg)",
        }}
      >
        <div
          className="spinner"
          style={{ width: 26, height: 26, borderWidth: 3 }}
        />
        <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>
          Cargando...
        </span>
      </div>
    );
  }

  if (!session) return <Login />;

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          flexDirection: "column",
          gap: 16,
          padding: 24,
          background: "var(--bg)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 32 }}>⚠️</div>
        <p style={{ color: "var(--danger)", maxWidth: 380 }}>{error}</p>
        <button className="btn btn-ghost" onClick={logout}>
          Cerrar sesión
        </button>
      </div>
    );
  }

  if (!pagina) return null;
  const cambiarPagina = (nuevaPagina) => {
    setPagina(nuevaPagina);
    setBusqueda("");
  };
  const mostrarBuscador = pagina === "expedicion" || pagina === "vendedor";

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <Sidebar pagina={pagina} setPagina={cambiarPagina} />

      <div
        className="app-content"
        style={{
          marginTop: ALTURA_NAV,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Header
          busqueda={mostrarBuscador ? busqueda : undefined}
          setBusqueda={mostrarBuscador ? setBusqueda : undefined}
          onAbrirMenu={() => setSidebarAbierto(true)}
          notifActivas={notifActivas}
          onToggleNotif={solicitarNotificaciones}
        />

        <main style={{ flex: 1 }}>
          {pagina === "vendedor" && (
            <VendedorView
              busqueda={busqueda}
              refrescarKey={refrescarKey}
              onNuevoPedido={() => setMostrarFormulario(true)}
            />
          )}
          {pagina === "expedicion" && (
            <ExpedicionView
              busqueda={busqueda}
              notifActivas={notifActivas}
              refrescarKey={refrescarKey}
              onNuevoPedido={() => setMostrarFormulario(true)}
            />
          )}
          {(pagina === "presupuestos" ||
            pagina === "estadisticas_presupuestos") && (
            <PresupuestosView
              vista={
                pagina === "estadisticas_presupuestos"
                  ? "estadisticas"
                  : "lista"
              }
              onCambiarVista={(v) =>
                cambiarPagina(
                  v === "estadisticas"
                    ? "estadisticas_presupuestos"
                    : "presupuestos",
                )
              }
            />
          )}
          {pagina === "objetivo" && <ObjetivoView />}
          {/* Devoluciones / notas de crédito: en prueba, solo el administrador */}
          {pagina === "devoluciones" && esAdmin && <DevolucionesView />}
          {pagina === "notas_credito" && esAdmin && <CajaNotasCredito />}
          {pagina === "caja" && <CajaView />}
          {pagina === "admin" && <AdminPanel />}
          {pagina === "metricas" && <MetricasView />}
          {pagina === "validar_salidas" && esAdmin && (
            <SeccionSegura nombre="Validar salidas">
              <ValidarSalidasView />
            </SeccionSegura>
          )}
        </main>
      </div>

      <AvisosToast
        carteles={carteles}
        onCerrar={cerrarCartel}
        onVer={(c) => {
          cerrarCartel(c.id);
          cambiarPagina(c.tipo === "espera" ? "expedicion" : "vendedor");
        }}
      />

      {mostrarFormulario && (
        <FormularioPedido
          onClose={() => setMostrarFormulario(false)}
          onSuccess={() => setRefrescarKey((k) => k + 1)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ThemeProvider>
  );
}
