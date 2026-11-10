import { PASOS } from './progreso.js'

// Encabezado común de cada paso: número, título (recibe el foco) y una bajada corta.
export default function EncabezadoPaso({ numero, titulo, refTitulo, opcional, children }) {
  return (
    <header className="pp-encabezado">
      <p className="pp-encabezado-num">Paso {numero} de {PASOS.length}{opcional ? ' (opcional)' : ''}</p>
      <h1 ref={refTitulo} tabIndex={-1}>{titulo}</h1>
      {children && <p className="pp-bajada">{children}</p>}
    </header>
  )
}
