import { useState } from 'react'

// Alias, CBU y link de pago con botón para copiar. También se usa en el login de un colegio
// suspendido por falta de pago.
export default function DatosDePago({ datos }) {
  const [copiado, setCopiado] = useState('')
  const copiar = async (clave, valor) => {
    try { await navigator.clipboard.writeText(valor); setCopiado(clave) } catch { setCopiado('') }
  }
  const filas = [['Alias', 'alias'], ['CBU', 'cbu'], ['Titular', 'titular']].filter(([, k]) => datos[k])
  return (
    <div className="datos-pago">
      {filas.length > 0 && (
        <dl>
          {filas.map(([etiqueta, k]) => (
            <div key={k}>
              <dt>{etiqueta}</dt>
              <dd>
                <span className={k === 'titular' ? 'dato-titular' : 'dato-copiable'}>{datos[k]}</span>
                {k !== 'titular' && (
                  <button type="button" className="btn btn-secundario btn-chico" onClick={() => copiar(k, datos[k])} aria-label={`Copiar ${etiqueta}`}>
                    {copiado === k ? 'Copiado' : 'Copiar'}
                  </button>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {datos.link && <a className="btn btn-primario" href={datos.link} target="_blank" rel="noopener noreferrer">Pagar con link de pago</a>}
      <span className="pp-oculto" aria-live="polite">{copiado ? 'Copiado al portapapeles' : ''}</span>
    </div>
  )
}
