// Barra de acciones fija abajo de cada paso: Atrás, un "lo hago después" opcional y la
// acción principal, que siempre dice lo que hace ("Guardar y seguir", "Finalizar…").
export default function Acciones({ onAtras, onSaltar, textoSaltar = 'Lo hago después', principal }) {
  return (
    <div className="pp-acciones">
      <div className="pp-acciones-in">
        {onAtras ? <button type="button" className="btn btn-secundario" onClick={onAtras}>Atrás</button> : <span />}
        <div className="pp-acciones-der">
          {onSaltar && <button type="button" className="btn-link" onClick={onSaltar}>{textoSaltar}</button>}
          {principal && (
            <button type={principal.submit ? 'submit' : 'button'} form={principal.form} className="btn btn-primario"
              onClick={principal.onClick} disabled={principal.cargando || principal.deshabilitado}>
              {principal.cargando ? (principal.textoCargando || 'Guardando…') : principal.texto}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
