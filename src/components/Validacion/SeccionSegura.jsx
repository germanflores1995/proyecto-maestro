import { Component, Suspense } from "react";

// Envuelve una sección: se carga solo cuando se entra a ella y, si algo falla
// (el archivo no carga, un error al dibujarla), muestra un aviso en su lugar.
// El resto de la aplicación sigue funcionando con normalidad.
class Limite extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error(`Error en la sección «${this.props.nombre}»:`, error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ padding: 24, maxWidth: 560, margin: "40px auto" }}>
        <div className="card" style={{ padding: 22, textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>⚠️</div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
            «{this.props.nombre}» no se pudo mostrar
          </div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 14 }}>
            Podés reintentar. El resto de la aplicación funciona con normalidad.
          </p>
          <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 14, wordBreak: "break-word" }}>
            {String(this.state.error?.message || this.state.error)}
          </p>
          <button className="btn btn-ghost" onClick={() => this.setState({ error: null })}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }
}

export default function SeccionSegura({ nombre, children }) {
  return (
    <Limite nombre={nombre}>
      <Suspense
        fallback={
          <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
            <span className="spinner" style={{ width: 24, height: 24 }} />
          </div>
        }
      >
        {children}
      </Suspense>
    </Limite>
  );
}
