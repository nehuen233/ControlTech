// Paso 6: resumen de lo creado, lo que quedó pendiente y "Finalizar configuración".
// El plano del colegio: cada laboratorio con su grilla de puestos.
import { useState } from 'react'
import { Alerta } from '../../components/ui.jsx'
import { CAPACIDAD_MAX } from '../Laboratorios.jsx'
import EncabezadoPaso from './Encabezado.jsx'
import Acciones from './Acciones.jsx'
import GrillaPuestos, { LeyendaPuestos } from './GrillaPuestos.jsx'
import { PASOS_TAREA, totalComputadoras } from './progreso.js'
import { IconoCheck } from './iconos.jsx'

export default function PasoResumen({ datos, estado, titulo, numero, onAtras, irA, finalizar }) {
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const { institucion: inst, laboratorios: labs, usuarios, software } = datos
  const equipo = usuarios.filter((u) => u.nombre_rol !== 'ADMINISTRADOR')
  const pcs = totalComputadoras(labs)

  const detalle = {
    institucion: estado.institucion ? [inst.nombre, inst.localidad, inst.provincia].filter(Boolean).join(', ') : 'Solo está cargado el nombre.',
    laboratorios: labs.length ? `${labs.length} laboratorio(s): ${labs.map((l) => l.nombre).join(', ')}.` : 'Ninguno todavía.',
    computadoras: pcs ? `${pcs} computadora(s) en ${labs.filter((l) => Number(l.total_equipos) > 0).length} laboratorio(s).` : 'Ninguna todavía.',
    equipo: equipo.length ? `${equipo.length} persona(s): ${equipo.map((u) => `${u.nombre} ${u.apellido}`).join(', ')}.` : 'Por ahora solo vos.',
    software: software.length ? `${software.length} programa(s): ${software.map((s) => s.nombre_software).join(', ')}.` : 'Ninguno todavía.',
  }
  // Lo imprescindible para usar el sistema: al menos un laboratorio con computadoras.
  const faltaLoMinimo = !estado.laboratorios || !estado.computadoras

  const terminar = async () => {
    setError('')
    setEnviando(true)
    try { await finalizar() } catch (e) { setError(e.message); setEnviando(false) }
  }

  return (
    <div className="pp-paso-form">
      <EncabezadoPaso numero={numero} titulo="Resumen" refTitulo={titulo}>
        {faltaLoMinimo
          ? 'Revisá lo que cargaste. Podés finalizar igual, pero ControlTech se aprovecha mejor con al menos un laboratorio y sus computadoras.'
          : 'Esto es lo que quedó cargado. Si está todo bien, finalizá la configuración.'}
      </EncabezadoPaso>

      <ol className="pp-resumen">
        {PASOS_TAREA.map((p, i) => {
          const hecho = estado[p.id]
          return (
            <li key={p.id} className={hecho ? 'es-hecho' : 'es-pendiente'}>
              <span className="pp-paso-marca" aria-hidden="true">{hecho ? <IconoCheck width={14} height={14} /> : i + 1}</span>
              <div>
                <h2>{p.titulo} <span className="pp-resumen-estado">{hecho ? 'Hecho' : p.opcional ? 'Opcional, sin cargar' : 'Pendiente'}</span></h2>
                <p>{detalle[p.id]}</p>
              </div>
              <button type="button" className="btn-link" onClick={() => irA(p.id)} aria-label={`${hecho ? 'Revisar' : 'Completar'} ${p.titulo}`}>{hecho ? 'Revisar' : 'Completar'}</button>
            </li>
          )
        })}
      </ol>

      {labs.length > 0 && (
        <section className="pp-bloque" aria-labelledby="res-plano">
          <div className="pp-bloque-cabecera">
            <h2 id="res-plano">Tu colegio</h2>
            <LeyendaPuestos />
          </div>
          <ul className="pp-plano">
            {labs.map((l) => (
              <li key={l.id_laboratorio}>
                <h3>{l.nombre}</h3>
                <GrillaPuestos capacidad={l.capacidad_equipos ?? CAPACIDAD_MAX} ocupados={Number(l.total_equipos || 0)} chica nombre={l.nombre} />
                <p className="pp-lab-cuenta">{Number(l.total_equipos || 0)} de {l.capacidad_equipos ?? CAPACIDAD_MAX}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div aria-live="assertive"><Alerta>{error}</Alerta></div>
      <Acciones onAtras={onAtras} principal={{ texto: 'Finalizar configuración', onClick: terminar, cargando: enviando, textoCargando: 'Finalizando…' }} />
    </div>
  )
}
