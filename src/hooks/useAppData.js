import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { ordenarPorPrioridad } from '../utils/helpers'

export function useAppData({ onNuevoEnEspera } = {}) {
  const [pedidos, setPedidos] = useState([])
  const [clientes, setClientes] = useState([])
  const [usuarios, setUsuarios] = useState([])
  const [loading, setLoading] = useState(true)
  const callbackRef = useRef(onNuevoEnEspera)
  callbackRef.current = onNuevoEnEspera

  const cargadoRef = useRef(false)
  const ultimaCargaRef = useRef(0)

  // Solo la primera carga muestra el indicador de "cargando".
  // Las siguientes (al actualizar un pedido o volver a la pestaña) refrescan sin parpadeo.
  const cargarTodo = useCallback(async () => {
    if (!cargadoRef.current) setLoading(true)
    const [pedidosRes, clientesRes, usuariosRes] = await Promise.all([
      supabase.from('pedidos').select('*').order('created_at'),
      supabase.from('clientes').select('*').eq('activo', true).order('nombre'),
      supabase.from('usuarios').select('*').eq('activo', true)
    ])
    // Si una consulta falla (por ejemplo, sin conexión) se conserva lo que ya había en pantalla
    if (!pedidosRes.error) setPedidos(ordenarPorPrioridad(pedidosRes.data || []))
    if (!clientesRes.error) setClientes(clientesRes.data || [])
    if (!usuariosRes.error) setUsuarios(usuariosRes.data || [])
    cargadoRef.current = true
    ultimaCargaRef.current = Date.now()
    setLoading(false)
  }, [])

  useEffect(() => { cargarTodo() }, [cargarTodo])

  // Al volver a la pestaña se actualizan los datos en silencio
  // (por si se perdió algún aviso en tiempo real mientras estaba en segundo plano)
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - ultimaCargaRef.current < 20000) return
      cargarTodo()
    }
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [cargarTodo])

  useEffect(() => {
    const channel = supabase.channel('pedidos-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setPedidos(prev => {
            if (prev.find(p => p.id === payload.new.id)) return prev
            if (payload.new.estado === 'en_espera') callbackRef.current?.(payload.new)
            return ordenarPorPrioridad([...prev, payload.new])
          })
        } else if (payload.eventType === 'UPDATE') {
          setPedidos(prev => {
            const actualizado = prev.map(p => p.id === payload.new.id ? { ...p, ...payload.new } : p)
            if (payload.new.estado === 'en_espera' && payload.old?.estado !== 'en_espera') {
              callbackRef.current?.(payload.new)
            }
            return ordenarPorPrioridad(actualizado)
          })
        } else if (payload.eventType === 'DELETE') {
          setPedidos(prev => prev.filter(p => p.id !== payload.old.id))
        }
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  const clientesMap = Object.fromEntries(clientes.map(c => [c.id, c]))
  const usuariosMap = Object.fromEntries(usuarios.map(u => [u.id, u]))

  return { pedidos, clientes, usuarios, clientesMap, usuariosMap, loading, refetch: cargarTodo }
}
