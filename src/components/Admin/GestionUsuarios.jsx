import { useState, useEffect, useMemo } from "react";
import {
  UserPlus,
  Pencil,
  KeyRound,
  UserX,
  UserCheck,
  Search,
  X,
  Eye,
  EyeOff,
  Wand2,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { ETIQUETAS_ROL, etiquetaRol } from "../../utils/roles";
import { iniciales } from "../../utils/helpers";

const CSS = `
.gu-barra { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 16px; }
.gu-buscar { position: relative; flex: 1 1 220px; min-width: 0; }
.gu-buscar svg { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none; }
.gu-buscar input { padding-left: 32px; width: 100%; }
.gu-lista { display: flex; flex-direction: column; gap: 8px; }
.gu-fila { display: flex; align-items: center; gap: 12px; padding: 12px 14px; flex-wrap: wrap; }
.gu-inactivo { opacity: 0.6; }
.gu-avatar { width: 38px; height: 38px; border-radius: 50%; background: var(--primary-subtle); color: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 800; flex-shrink: 0; }
.gu-datos { flex: 1 1 200px; min-width: 0; }
.gu-nombre { font-weight: 700; font-size: 14px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.gu-email { font-size: 12px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gu-acciones { display: flex; gap: 6px; margin-left: auto; }
.gu-aviso { padding: 10px 12px; border-radius: 8px; font-size: 13px; margin-bottom: 14px; }
.gu-ok { background: var(--success-bg); color: var(--success); }
.gu-campo { margin-bottom: 14px; }
.gu-campo label { display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 5px; }
.gu-clave { display: flex; gap: 6px; }
.gu-clave input { flex: 1; min-width: 0; }
@media (max-width: 640px) {
  .gu-fila { padding: 10px 12px; }
  .gu-acciones { width: 100%; justify-content: flex-end; }
}
`;

// Contraseña provisoria legible (sin caracteres que se confunden)
function generarClave() {
  const letras = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => letras[n % letras.length]).join("");
}

// Llama a la función de Supabase y devuelve el mensaje de error legible
async function llamar(body) {
  // Se manda explícitamente el token de la sesión actual
  const { data: sesion } = await supabase.auth.getSession();
  const token = sesion?.session?.access_token;
  if (!token) throw new Error("Tu sesión venció. Cerrá sesión y volvé a entrar.");
  const { data, error } = await supabase.functions.invoke("gestionar-usuarios", {
    body,
    headers: { Authorization: `Bearer ${token}` },
  });
  if (error) {
    let msg = "No se pudo completar la acción.";
    if (error.context && typeof error.context.json === "function") {
      try {
        const j = await error.context.json();
        if (j?.error) msg = j.error;
        else msg = `${msg} (código ${error.context.status})`;
      } catch {
        msg = `${msg} (código ${error.context?.status ?? "?"})`;
      }
    } else if (error.message) {
      msg = `No se pudo conectar con la función "gestionar-usuarios": ${error.message}`;
    }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export default function GestionUsuarios() {
  const { perfil } = useAuth();
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("activos");
  const [soloLectura, setSoloLectura] = useState(false);
  const [modal, setModal] = useState(null); // { tipo: "crear" | "editar" | "clave", usuario }

  const cargar = async () => {
    try {
      const { usuarios } = await llamar({ action: "listar" });
      setUsuarios(usuarios || []);
      setError("");
      setSoloLectura(false);
    } catch (e) {
      // Respaldo: si la función no responde, se lee la lista directo de la base
      const { data, error: errLista } = await supabase
        .from("usuarios")
        .select("*")
        .order("nombre");
      if (!errLista && data) {
        setUsuarios(data);
        setSoloLectura(true);
        setError(`La función de gestión no respondió, por eso solo se puede ver la lista. Detalle: ${e.message}`);
      } else {
        setError(e.message);
      }
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => {
    cargar();
  }, []);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return usuarios.filter((u) => {
      if (filtro === "activos" && !u.activo) return false;
      if (filtro === "inactivos" && u.activo) return false;
      if (!q) return true;
      return (
        (u.nombre || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q) ||
        etiquetaRol(u.rol).toLowerCase().includes(q)
      );
    });
  }, [usuarios, busqueda, filtro]);

  const cambiarActivo = async (u) => {
    const activar = !u.activo;
    const ok = window.confirm(
      activar
        ? `¿Reactivar a ${u.nombre}? Va a poder ingresar de nuevo.`
        : `¿Desactivar a ${u.nombre}? No va a poder ingresar a la app. Sus pedidos y su historial se conservan.`,
    );
    if (!ok) return;
    try {
      await llamar({ action: "activo", id: u.id, activo: activar });
      setAviso(`${u.nombre} quedó ${activar ? "activo" : "desactivado"}.`);
      cargar();
    } catch (e) {
      setError(e.message);
    }
  };

  const terminar = (texto) => {
    setModal(null);
    setError("");
    setAviso(texto);
    cargar();
  };

  return (
    <div>
      <style>{CSS}</style>

      <div className="gu-barra">
        <div className="gu-buscar">
          <Search size={15} />
          <input
            className="input"
            placeholder="Buscar por nombre, email o rol"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <select
          className="input"
          style={{ width: "auto" }}
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        >
          <option value="activos">Activos</option>
          <option value="inactivos">Desactivados</option>
          <option value="todos">Todos</option>
        </select>
        <button className="btn btn-primary" onClick={() => setModal({ tipo: "crear" })}>
          <UserPlus size={15} /> Nuevo usuario
        </button>
      </div>

      {aviso && <div className="gu-aviso gu-ok">{aviso}</div>}
      {error && <p className="form-error" style={{ marginBottom: 12 }}>{error}</p>}

      {cargando ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
          <span className="spinner" style={{ width: 24, height: 24 }} />
        </div>
      ) : visibles.length === 0 ? (
        <div className="empty-state">
          <p style={{ fontSize: 14, fontWeight: 600 }}>No hay usuarios para mostrar</p>
        </div>
      ) : (
        <div className="gu-lista">
          {visibles.map((u) => {
            const soyYo = u.id === perfil?.id;
            return (
              <div key={u.id} className={`card gu-fila${u.activo ? "" : " gu-inactivo"}`}>
                <div className="gu-avatar">{iniciales(u.nombre)}</div>
                <div className="gu-datos">
                  <div className="gu-nombre">
                    {u.nombre}
                    {soyYo && (
                      <span className="badge" style={{ background: "var(--primary-subtle)", color: "var(--primary)", fontSize: 10 }}>
                        Vos
                      </span>
                    )}
                    {!u.activo && (
                      <span className="badge" style={{ background: "rgba(239,68,68,0.12)", color: "#EF4444", fontSize: 10 }}>
                        Desactivado
                      </span>
                    )}
                  </div>
                  <div className="gu-email" title={u.email}>{u.email}</div>
                </div>
                <span className="badge" style={{ background: "var(--surface-container)", color: "var(--text-secondary)" }}>
                  {etiquetaRol(u.rol)}
                </span>
                <div className="gu-acciones">
                  <button className="btn-icon" title="Editar" onClick={() => setModal({ tipo: "editar", usuario: u })}>
                    <Pencil size={16} />
                  </button>
                  <button className="btn-icon" title="Cambiar contraseña" onClick={() => setModal({ tipo: "clave", usuario: u })}>
                    <KeyRound size={16} />
                  </button>
                  {!soyYo && (
                    <button
                      className="btn-icon"
                      title={u.activo ? "Desactivar" : "Reactivar"}
                      onClick={() => cambiarActivo(u)}
                      style={{ color: u.activo ? "#EF4444" : "var(--success)" }}
                    >
                      {u.activo ? <UserX size={16} /> : <UserCheck size={16} />}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(modal?.tipo === "crear" || modal?.tipo === "editar") && (
        <ModalUsuario
          usuario={modal.usuario}
          soyYo={modal.usuario?.id === perfil?.id}
          onClose={() => setModal(null)}
          onListo={terminar}
        />
      )}
      {modal?.tipo === "clave" && (
        <ModalClave usuario={modal.usuario} onClose={() => setModal(null)} onListo={terminar} />
      )}
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <div className="gu-campo">
      <label>{label}</label>
      {children}
    </div>
  );
}

function CampoClave({ valor, onChange }) {
  const [ver, setVer] = useState(false);
  return (
    <div className="gu-clave">
      <input
        className="input"
        type={ver ? "text" : "password"}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Mínimo 8 caracteres"
        autoComplete="new-password"
      />
      <button type="button" className="btn btn-ghost" onClick={() => setVer((v) => !v)} title={ver ? "Ocultar" : "Ver"}>
        {ver ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => {
          onChange(generarClave());
          setVer(true);
        }}
        title="Generar una contraseña"
      >
        <Wand2 size={15} /> Generar
      </button>
    </div>
  );
}

function Ventana({ titulo, onClose, children, pie }) {
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <h3 style={{ fontSize: 16, fontWeight: 700 }}>{titulo}</h3>
          <button className="btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">{pie}</div>
      </div>
    </div>
  );
}

function ModalUsuario({ usuario, soyYo, onClose, onListo }) {
  const editando = !!usuario;
  const [nombre, setNombre] = useState(usuario?.nombre || "");
  const [email, setEmail] = useState(usuario?.email || "");
  const [rol, setRol] = useState(usuario?.rol || "vendedor");
  const [clave, setClave] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const guardar = async (e) => {
    e.preventDefault();
    setError("");
    setGuardando(true);
    try {
      if (editando) {
        const cambios = { action: "modificar", id: usuario.id, nombre, rol };
        if (email.trim().toLowerCase() !== (usuario.email || "").toLowerCase()) cambios.email = email;
        await llamar(cambios);
        onListo(`Se guardaron los cambios de ${nombre}.`);
      } else {
        await llamar({ action: "crear", nombre, email, rol, password: clave });
        onListo(`Usuario creado. Pasale a ${nombre} su email (${email.trim().toLowerCase()}) y la contraseña provisoria.`);
      }
    } catch (err) {
      setError(err.message);
      setGuardando(false);
    }
  };

  return (
    <Ventana
      titulo={editando ? "Editar usuario" : "Nuevo usuario"}
      onClose={onClose}
      pie={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="form-usuario" className="btn btn-primary" disabled={guardando}>
            {guardando ? "Guardando..." : editando ? "Guardar" : "Crear usuario"}
          </button>
        </>
      }
    >
      <form id="form-usuario" onSubmit={guardar}>
        <Campo label="Nombre">
          <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} required autoFocus />
        </Campo>
        <Campo label="Email">
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Campo>
        <Campo label="Rol">
          <select className="input" value={rol} onChange={(e) => setRol(e.target.value)} disabled={soyYo}>
            {Object.entries(ETIQUETAS_ROL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          {soyYo && (
            <small style={{ color: "var(--text-muted)" }}>No podés cambiar tu propio rol.</small>
          )}
        </Campo>
        {!editando && (
          <Campo label="Contraseña provisoria">
            <CampoClave valor={clave} onChange={setClave} />
          </Campo>
        )}
        {error && <p className="form-error">{error}</p>}
      </form>
    </Ventana>
  );
}

function ModalClave({ usuario, onClose, onListo }) {
  const [clave, setClave] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const guardar = async (e) => {
    e.preventDefault();
    setError("");
    setGuardando(true);
    try {
      await llamar({ action: "password", id: usuario.id, password: clave });
      onListo(`Se cambió la contraseña de ${usuario.nombre}. Pasale la nueva.`);
    } catch (err) {
      setError(err.message);
      setGuardando(false);
    }
  };

  return (
    <Ventana
      titulo={`Contraseña de ${usuario.nombre}`}
      onClose={onClose}
      pie={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="form-clave" className="btn btn-primary" disabled={guardando}>
            {guardando ? "Guardando..." : "Cambiar contraseña"}
          </button>
        </>
      }
    >
      <form id="form-clave" onSubmit={guardar}>
        <Campo label="Nueva contraseña">
          <CampoClave valor={clave} onChange={setClave} />
        </Campo>
        {error && <p className="form-error">{error}</p>}
      </form>
    </Ventana>
  );
}
