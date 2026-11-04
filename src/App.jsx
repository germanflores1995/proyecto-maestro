import { useState, useEffect } from "react";
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
import AdminPanel from "./components/Admin/AdminPanel";
import MetricasView from "./components/Metricas/MetricasView";
import FormularioPedido from "./components/Pedidos/FormularioPedido";
import PresupuestosView from "./components/Presupuestos/PresupuestosView";
import ObjetivoView from "./components/Metricas/ObjetivoView";

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

  if (loading) {
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
      <Sidebar
        pagina={pagina}
        setPagina={cambiarPagina}
        notifActivas={notifActivas}
        onToggleNotif={solicitarNotificaciones}
      />

      {/* <Sidebar
        pagina={pagina}
        setPagina={cambiarPagina}
        abierto={sidebarAbierto}
        onCerrar={() => setSidebarAbierto(false)}
      /> */}

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
            <VendedorView busqueda={busqueda} refrescarKey={refrescarKey} />
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
          {pagina === "devoluciones" && <DevolucionesView />}
          {pagina === "caja" && <CajaView />}
          {pagina === "admin" && <AdminPanel />}
          {pagina === "metricas" && <MetricasView />}
        </main>
      </div>

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
