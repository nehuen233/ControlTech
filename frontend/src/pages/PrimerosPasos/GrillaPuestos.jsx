// Grilla de puestos de un laboratorio: un cuadrado por lugar hasta su capacidad.
// Ocupados (computadoras ya cargadas), nuevos (por agregar), libres y, si se pasa de la
// capacidad, los excedidos en rojo. Es el aviso de capacidad del asistente: se ve ANTES de enviar.
export default function GrillaPuestos({ capacidad, ocupados = 0, nuevos = 0, chica = false, nombre }) {
  const cap = Number(capacidad) || 0
  const total = Math.max(cap, ocupados + nuevos)
  const excedidos = Math.max(0, ocupados + nuevos - cap)
  const libres = Math.max(0, cap - ocupados - nuevos)
  const partes = [`${ocupados} de ${cap} lugares ocupados`]
  if (nuevos) partes.push(`${nuevos} por agregar`)
  if (excedidos) partes.push(`${excedidos} de más`)
  else partes.push(`${libres} libres`)
  const celdas = Array.from({ length: total }, (_, i) => {
    if (i < ocupados) return 'ocupado'
    if (i >= cap) return 'excedido'
    if (i < ocupados + nuevos) return 'nuevo'
    return 'libre'
  })
  return (
    <div className={`pp-grilla ${chica ? 'pp-grilla-chica' : ''}`} role="img" aria-label={`${nombre ? `${nombre}: ` : ''}${partes.join(', ')}.`}>
      {celdas.map((t, i) => <span key={i} className={`pp-puesto pp-puesto-${t}`} />)}
    </div>
  )
}

export function LeyendaPuestos({ conNuevos = false, conExcedidos = false }) {
  return (
    <ul className="pp-leyenda" aria-hidden="true">
      <li><span className="pp-puesto pp-puesto-ocupado" /> Cargada</li>
      {conNuevos && <li><span className="pp-puesto pp-puesto-nuevo" /> Por agregar</li>}
      <li><span className="pp-puesto pp-puesto-libre" /> Libre</li>
      {conExcedidos && <li><span className="pp-puesto pp-puesto-excedido" /> No entra</li>}
    </ul>
  )
}
