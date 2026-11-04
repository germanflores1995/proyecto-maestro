import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// Guarda una preferencia de cada usuario en la base (tabla preferencias_usuario),
// así la vista y el orden elegido se recuerdan entre sesiones y equipos.
// Mientras carga, o si no hay nada guardado, usa el valor por defecto.
export function usePreferencia(clave, valorPorDefecto) {
  const [valor, setValor] = useState(valorPorDefecto);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("preferencias_usuario")
          .select("valor")
          .eq("clave", clave)
          .maybeSingle();
        if (vivo && !error && data) setValor(data.valor);
      } catch {
        // Si falla la consulta, queda el valor por defecto
      }
    })();
    return () => {
      vivo = false;
    };
  }, [clave]);

  const guardar = (nuevo) => {
    setValor(nuevo);
    supabase
      .from("preferencias_usuario")
      .upsert(
        { clave, valor: nuevo, updated_at: new Date().toISOString() },
        { onConflict: "usuario_id,clave" },
      )
      .then(({ error }) => {
        if (error) console.error("No se pudo guardar la preferencia:", error.message);
      })
      .catch(() => {});
  };

  return [valor, guardar];
}
