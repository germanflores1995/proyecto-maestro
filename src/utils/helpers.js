import { ESTADOS } from './constants'

export function ordenarPorPrioridad(pedidos) {
  return [...pedidos].sort((a, b) => {
    const pa = ESTADOS[a.estado]?.priority ?? 99
    const pb = ESTADOS[b.estado]?.priority ?? 99
    if (pa !== pb) return pa - pb
    return new Date(a.created_at) - new Date(b.created_at)
  })
}

export function ordenarPorHora(pedidos, campo = 'created_at') {
  return [...pedidos].sort((a, b) => new Date(b[campo]) - new Date(a[campo]))
}

export function ordenarPorCliente(pedidos, clientesMap) {
  return [...pedidos].sort((a, b) => {
    const nombreA = clientesMap[a.cliente_id]?.nombre || ''
    const nombreB = clientesMap[b.cliente_id]?.nombre || ''
    return nombreA.localeCompare(nombreB)
  })
}

export function ordenarPorVendedor(pedidos, usuariosMap) {
  return [...pedidos].sort((a, b) => {
    const nombreA = usuariosMap[a.vendedor_id]?.nombre || ''
    const nombreB = usuariosMap[b.vendedor_id]?.nombre || ''
    return nombreA.localeCompare(nombreB)
  })
}

// Búsqueda por número: coincide en cualquier parte del número de pedido
export function coincideNumero(numeroPedido, query) {
  if (!query) return true
  return numeroPedido.toLowerCase().includes(query.toLowerCase())
}

export function formatearFechaHora(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit'
  })
}

export function formatearHora(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

export function formatearFechaCorta(dateStr) {
  if (!dateStr) return '—'
  const fecha = new Date(dateStr)
  const hoy = new Date()
  const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1)

  if (fecha.toDateString() === hoy.toDateString()) return formatearHora(dateStr)
  if (fecha.toDateString() === ayer.toDateString()) return 'Ayer'
  return fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

export function tiempoTranscurrido(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `hace ${hrs}h`
  return `hace ${Math.floor(hrs / 24)}d`
}

export function iniciales(nombre) {
  if (!nombre) return '?'
  return nombre.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

export function formatearMonto(valor) {
  if (valor === null || valor === undefined) return '—'
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(valor)
}

export function esHoy(dateStr) {
  if (!dateStr) return false
  return new Date(dateStr).toDateString() === new Date().toDateString()
}
