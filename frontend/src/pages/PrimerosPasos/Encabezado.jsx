import { PASOS_TAREA } from './progreso.js'

// Encabezado común de cada paso: número, título (recibe el foco) y una bajada corta.
export default function EncabezadoPaso({ numero, titulo, refTitulo, opcional, children }) {
  return (
    <header className="pp-encabezado">
      <p className="pp-encabezado-num">
        {numero > PASOS_TAREA.length ? 'Último paso: revisá y finalizá' : `Paso ${numero} de ${PASOS_TAREA.length}${opcional ? ' (opcional)' : ''}`}
      </p>
      <h1 ref={refTitulo} tabIndex={-1}>{titulo}</h1>
      {children && <p className="pp-bajada">{children}</p>}
    </header>
  )
}
