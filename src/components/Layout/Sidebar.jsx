import { useEffect, useRef, useState } from "react";
import {
  LayoutGrid,
  PackageSearch,
  FileText,
  BarChart3,
  HelpCircle,
  LogOut,
  ChevronDown,
  Menu,
  X,
  Bell,
  Sun,
  Moon,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../contexts/ThemeContext";
import { etiquetaRol } from "../../utils/roles";
import { iniciales } from "../../utils/helpers";
import useNotificaciones from "../../hooks/useNotificaciones";
import AyudaModal from "../Ayuda/AyudaModal";
import "./Sidebar.css";

// Altura de la barra superior. App.jsx deja este espacio arriba del contenido.
export const ALTURA_NAV = 60;

export default function Sidebar({ pagina, setPagina }) {
  const {
    perfil,
    logout,
    esAdmin,
    esExpedicion,
    esVendedor,
    esEncargadoVentas,
    esEncargadoExpedicion,
    puedeVerMetricas,
  } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const {
    items,
    total,
    porPagina,
    avisosActivos,
    avisosSoportados,
    mensajeAvisos,
    cambiarAvisos,
  } = useNotificaciones();

  const esEncargadoVentasPuro = perfil?.rol === "encargado_ventas";

  // Menú principal
  const navItems = [];
  if (esVendedor || esAdmin || esEncargadoExpedicion) {
    navItems.push({ key: "vendedor", label: "Pedidos", icon: LayoutGrid, badge: porPagina.vendedor || 0 });
  }
  if (esExpedicion || esVendedor) {
    navItems.push({ key: "expedicion", label: "Expedición", icon: PackageSearch, badge: porPagina.expedicion || 0 });
  }
  if (esVendedor || esAdmin || esEncargadoVentas) {
    navItems.push({ key: "presupuestos", label: "Presupuestos", icon: FileText, badge: porPagina.presupuestos || 0 });
  }

  // Informes: un grupo por área
  const grupos = [];
  const informesExpedicion = [];
  if (puedeVerMetricas && !esEncargadoVentasPuro) {
    informesExpedicion.push({ key: "metricas", label: "Métricas" });
  }
  if (esAdmin || esEncargadoExpedicion) {
    informesExpedicion.push({ key: "objetivo", label: "Objetivo" });
  }
  if (informesExpedicion.length) grupos.push({ titulo: "Expedición", items: informesExpedicion });

  const informesVentas = [];
  if (esAdmin || esEncargadoVentas || esVendedor) {
    informesVentas.push({ key: "estadisticas_presupuestos", label: "Estadísticas" });
  }
  if (informesVentas.length) grupos.push({ titulo: "Ventas", items: informesVentas });

  const informesActivo = grupos.some((g) => g.items.some((i) => i.key === pagina));

  // Un solo desplegable abierto a la vez: null | "informes" | "campana" | "usuario"
  const [panel, setPanel] = useState(null);
  const [cajonAbierto, setCajonAbierto] = useState(false);
  const [posInformes, setPosInformes] = useState({ left: 0, top: 0 });
  const [mostrarAyuda, setMostrarAyuda] = useState(false);

  const botonInformesRef = useRef(null);
  const panelInformesRef = useRef(null);
  const campanaRef = useRef(null);
  const usuarioRef = useRef(null);

  // Cierra el desplegable abierto al tocar fuera o con Escape
  useEffect(() => {
    if (!panel) return;
    const refs = [botonInformesRef, panelInformesRef, campanaRef, usuarioRef];
    const fuera = (e) => {
      if (!refs.some((r) => r.current?.contains(e.target))) setPanel(null);
    };
    const tecla = (e) => {
      if (e.key === "Escape") setPanel(null);
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("touchstart", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("touchstart", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [panel]);

  const alternarPanel = (cual) => setPanel((p) => (p === cual ? null : cual));

  const alternarInformes = () => {
    if (panel !== "informes" && botonInformesRef.current) {
      const r = botonInformesRef.current.getBoundingClientRect();
      setPosInformes({ left: r.left, top: r.bottom + 6 });
    }
    alternarPanel("informes");
  };

  const irA = (key) => {
    setPagina(key);
    setPanel(null);
    setCajonAbierto(false);
  };

  const irAInicio = () => {
    const paginaInicio = esVendedor ? "vendedor" : esExpedicion ? "expedicion" : "admin";
    setPagina(paginaInicio);
  };

  const abrirAyuda = () => {
    setPanel(null);
    setCajonAbierto(false);
    setMostrarAyuda(true);
  };

  return (
    <nav className="nav-barra">
      <div className="nav-izquierda">
        {/* Tablet y celular: botón de menú (único) */}
        <button
          type="button"
          className="nav-hamburguesa"
          onClick={() => {
            setPanel(null);
            setCajonAbierto((v) => !v);
          }}
          aria-label={cajonAbierto ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={cajonAbierto}
        >
          {cajonAbierto ? <X size={20} /> : <Menu size={20} />}
        </button>

        <div className="nav-marca" onClick={irAInicio}>
          <img src="/logo.png" alt="DM" className="nav-logo" />
          <div className="nav-marca-titulo">Distribuidora Maestro</div>
        </div>

        {/* Escritorio: menú horizontal */}
        <ul className="nav-menu">
          {navItems.map((item) => {
            const Icon = item.icon;
            const activo = pagina === item.key;
            return (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => irA(item.key)}
                  className={`nav-btn${activo ? " nav-btn-activo" : ""}`}
                >
                  <Icon size={15} />
                  {item.label}
                  {item.badge > 0 && <span className="nav-badge">{item.badge}</span>}
                </button>
              </li>
            );
          })}
          {grupos.length > 0 && (
            <li>
              <button
                type="button"
                ref={botonInformesRef}
                onClick={alternarInformes}
                className={`nav-btn${informesActivo || panel === "informes" ? " nav-btn-activo" : ""}`}
              >
                <BarChart3 size={15} />
                Informes
                <ChevronDown size={14} />
              </button>
            </li>
          )}
        </ul>
      </div>

      {/* Derecha: avisos, tema y cuenta */}
      <div className="nav-derecha">
        <div className="nav-wrap" ref={campanaRef}>
          <button
            type="button"
            className="nav-icono"
            onClick={() => alternarPanel("campana")}
            aria-label={total > 0 ? `Notificaciones: ${total} pendientes` : "Notificaciones"}
            aria-expanded={panel === "campana"}
            title="Requiere atención"
          >
            <Bell size={17} />
            {total > 0 && <span className="nav-campana-num">{total > 99 ? "99+" : total}</span>}
          </button>

          {panel === "campana" && (
            <div className="nav-flotante nav-flotante-campana" role="menu">
              <div className="nav-mu-titulo">
                Requiere atención
                {total > 0 && <span className="nav-mu-total">{total}</span>}
              </div>
              {items.length === 0 ? (
                <div className="nav-mu-vacio">Todo en orden por ahora.</div>
              ) : (
                items.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    role="menuitem"
                    className="nav-mu-item"
                    onClick={() => irA(it.pagina)}
                  >
                    <span className={`nav-mu-punto nivel-${it.nivel}`} />
                    <span className="nav-mu-texto">{it.texto}</span>
                    <span className="nav-mu-cant">{it.cantidad}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          className="nav-icono nav-icono-tema"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
          title={theme === "dark" ? "Tema claro" : "Tema oscuro"}
        >
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </button>

        <div className="nav-wrap" ref={usuarioRef}>
          <button
            type="button"
            className="nav-usuario"
            onClick={() => alternarPanel("usuario")}
            aria-haspopup="menu"
            aria-expanded={panel === "usuario"}
            title="Tu cuenta"
          >
            <span className="nav-avatar">{iniciales(perfil?.nombre)}</span>
            <span className="nav-usuario-texto">
              <span className="nav-usuario-nombre">{perfil?.nombre}</span>
              <span className="nav-usuario-rol">{etiquetaRol(perfil?.rol)}</span>
            </span>
            <ChevronDown size={14} className="nav-usuario-flecha" />
          </button>

          {panel === "usuario" && (
            <div className="nav-flotante nav-flotante-usuario" role="menu">
              <div className="nav-mu-cab">
                <div className="nav-mu-nombre">{perfil?.nombre}</div>
                <div className="nav-mu-rol">{etiquetaRol(perfil?.rol)}</div>
              </div>

              <div className="nav-mu-switch">
                <div className="nav-mu-switch-texto">
                  <span className="nav-mu-texto">Avisos</span>
                  <small>
                    {avisosSoportados
                      ? "Te avisa de lo que pide atención cuando estás en otra pestaña"
                      : "Este navegador no permite avisos"}
                  </small>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={avisosActivos}
                  aria-label="Activar avisos"
                  className={`nav-switch${avisosActivos ? " nav-switch-on" : ""}`}
                  onClick={cambiarAvisos}
                  disabled={!avisosSoportados}
                >
                  <span className="nav-switch-bolita" />
                </button>
              </div>
              {mensajeAvisos && <div className="nav-mu-aviso">{mensajeAvisos}</div>}

              <div className="nav-mu-separador" />
              <button type="button" role="menuitem" className="nav-mu-item" onClick={abrirAyuda}>
                <HelpCircle size={16} />
                <span className="nav-mu-texto">Ayuda</span>
              </button>
              <button type="button" role="menuitem" className="nav-mu-item nav-mu-peligro" onClick={logout}>
                <LogOut size={16} />
                <span className="nav-mu-texto">Cerrar sesión</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Escritorio: desplegable de Informes */}
      {panel === "informes" && grupos.length > 0 && (
        <div
          ref={panelInformesRef}
          className="nav-panel-informes"
          style={{ left: posInformes.left, top: posInformes.top }}
        >
          {grupos.map((g) => (
            <div key={g.titulo} className="nav-grupo">
              <div className="nav-grupo-titulo">{g.titulo}</div>
              {g.items.map((i) => (
                <button
                  key={i.key}
                  type="button"
                  onClick={() => irA(i.key)}
                  className={`nav-subitem${pagina === i.key ? " nav-subitem-activo" : ""}`}
                >
                  {i.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Tablet y celular: cajón con todas las opciones de navegación */}
      {cajonAbierto && (
        <div className="nav-cajon">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => irA(item.key)}
                className={`nav-cajon-item${pagina === item.key ? " nav-cajon-item-activo" : ""}`}
              >
                <Icon size={18} />
                {item.label}
                {item.badge > 0 && <span className="nav-badge">{item.badge}</span>}
              </button>
            );
          })}

          {grupos.map((g) => (
            <div key={g.titulo}>
              <div className="nav-cajon-grupo-titulo">Informes · {g.titulo}</div>
              {g.items.map((i) => (
                <button
                  key={i.key}
                  type="button"
                  onClick={() => irA(i.key)}
                  className={`nav-cajon-item${pagina === i.key ? " nav-cajon-item-activo" : ""}`}
                >
                  <BarChart3 size={18} />
                  {i.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {mostrarAyuda && <AyudaModal onClose={() => setMostrarAyuda(false)} />}
    </nav>
  );
}
