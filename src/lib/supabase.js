import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan las variables de entorno VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en el archivo .env')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/**
 * Cliente temporal para registrar nuevos usuarios sin pisar la sesión del admin.
 * Requiere "Disable email confirmations" activado en Supabase → Authentication → Settings.
 */
export function crearClienteTemporal() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storageKey: `temp_signup_${Date.now()}`,
      autoRefreshToken: false,
      persistSession: false
    }
  })
}
