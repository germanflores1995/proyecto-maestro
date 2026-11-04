import { useState } from "react";
import { Eye, EyeOff, User, Lock, Sun, Moon } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../contexts/ThemeContext";

export default function Login() {
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mostrarPass, setMostrarPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Completá usuario y contraseña.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await login(email, password);
    } catch (err) {
      setError("Usuario o contraseña incorrectos.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.patternOverlay} />

      {/* Toggle de tema */}
      <button
        onClick={toggleTheme}
        style={styles.themeToggle}
        aria-label="Cambiar tema"
        title={
          theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"
        }
      >
        {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.accentBar} />

          <div style={styles.logoWrap}>
            <img
              src="/logo.png"
              alt="Distribuidora Maestro S.R.L."
              style={styles.logo}
            />
          </div>

          <h1 style={styles.title}>Iniciar sesión</h1>

          <form onSubmit={handleSubmit} style={{ marginTop: 28 }}>
            <div className="form-group">
              <label className="form-label">Usuario / Email</label>
              <div style={{ position: "relative" }}>
                <User size={18} style={styles.inputIcon} />
                <input
                  type="email"
                  className="input"
                  style={{ paddingLeft: 42 }}
                  placeholder="operador@maestro.srl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Clave de seguridad</label>
              <div style={{ position: "relative" }}>
                <Lock size={18} style={styles.inputIcon} />
                <input
                  type={mostrarPass ? "text" : "password"}
                  className="input"
                  style={{ paddingLeft: 42, paddingRight: 42 }}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setMostrarPass((v) => !v)}
                  style={styles.eyeBtn}
                  tabIndex={-1}
                >
                  {mostrarPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && <div style={styles.errorBox}>{error}</div>}

            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={loading}
              style={{
                padding: "13px 16px",
                fontSize: 14,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                marginTop: 6,
              }}
            >
              {loading ? (
                <>
                  <span className="spinner" />
                  Ingresando...
                </>
              ) : (
                "Iniciar sesión"
              )}
            </button>
          </form>

          <div style={styles.statusRow}>
            <span style={styles.pulseDot} />
            <span style={styles.statusText}>Sistema en línea</span>
          </div>
        </div>

        <p style={styles.footer}>
          © {new Date().getFullYear()} Distribuidora Maestro S.R.L. · Sistema
          interno
        </p>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
    background: "var(--bg)",
  },
  patternOverlay: {
    position: "absolute",
    inset: 0,
    backgroundImage: `
      linear-gradient(30deg, var(--surface-container) 12%, transparent 12.5%, transparent 87%, var(--surface-container) 87.5%, var(--surface-container)),
      linear-gradient(150deg, var(--surface-container) 12%, transparent 12.5%, transparent 87%, var(--surface-container) 87.5%, var(--surface-container)),
      linear-gradient(30deg, var(--surface-container) 12%, transparent 12.5%, transparent 87%, var(--surface-container) 87.5%, var(--surface-container)),
      linear-gradient(150deg, var(--surface-container) 12%, transparent 12.5%, transparent 87%, var(--surface-container) 87.5%, var(--surface-container)),
      linear-gradient(60deg, var(--surface-container-high) 25%, transparent 25.5%, transparent 75%, var(--surface-container-high) 75%, var(--surface-container-high)),
      linear-gradient(60deg, var(--surface-container-high) 25%, transparent 25.5%, transparent 75%, var(--surface-container-high) 75%, var(--surface-container-high))
    `,
    backgroundSize: "80px 140px",
    backgroundPosition: "0 0, 0 0, 40px 70px, 40px 70px, 0 0, 40px 70px",
    opacity: 0.6,
  },
  themeToggle: {
    position: "absolute",
    top: 24,
    right: 24,
    zIndex: 20,
    width: 40,
    height: 40,
    borderRadius: "50%",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    color: "var(--text)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "var(--shadow-sm)",
  },
  container: {
    position: "relative",
    zIndex: 10,
    width: "100%",
    maxWidth: 400,
    padding: "0 16px",
  },
  card: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 14,
    padding: "38px 36px 30px",
    position: "relative",
    overflow: "hidden",
    boxShadow: "0 0 50px rgba(21,101,192,0.12), var(--shadow-lg)",
  },
  accentBar: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: 5,
    background: "var(--primary)",
  },
  logoWrap: { display: "flex", justifyContent: "center", marginBottom: 22 },
  logo: { height: 84, objectFit: "contain" },
  title: {
    fontFamily: "Montserrat, sans-serif",
    fontSize: 21,
    fontWeight: 700,
    textAlign: "center",
    color: "var(--text)",
  },
  subtitle: {
    textAlign: "center",
    color: "var(--text-secondary)",
    fontSize: 13,
    marginTop: 4,
  },
  inputIcon: {
    position: "absolute",
    left: 13,
    top: "50%",
    transform: "translateY(-50%)",
    color: "var(--text-muted)",
    pointerEvents: "none",
  },
  eyeBtn: {
    position: "absolute",
    right: 10,
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    display: "flex",
    padding: 4,
  },
  errorBox: {
    background: "var(--danger-bg)",
    border: "1px solid transparent",
    borderRadius: 6,
    padding: "9px 12px",
    fontSize: 13,
    color: "var(--danger)",
    marginBottom: 4,
  },
  statusRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 26,
    paddingTop: 20,
    borderTop: "1px solid var(--border)",
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "var(--success)",
    boxShadow: "0 0 0 3px var(--success-bg)",
  },
  statusText: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
    textTransform: "uppercase",
  },
  footer: {
    textAlign: "center",
    color: "var(--text-muted)",
    fontSize: 11,
    marginTop: 22,
  },
};
