import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'
import { Alerta, Badge, Cargando, Modal, fecha } from '../components/ui.jsx'
import { CONCEPTOS, MEDIOS, etiquetaConcepto, etiquetaPlan, hoyAR, periodoTexto, pesos } from './pagos/formato.js'

// Sección del SUPERADMIN: cobro del abono de cada colegio. Resumen del mes, estado de cuenta por
// institución, registro manual de pagos e historial con corrección y anulación.
const ESTADOS_CUENTA = ['Vencido', 'Pendiente', 'Suspendida', 'Al día', 'En prueba', 'Sin plan']

export default function Pagos() {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [filtro, setFiltro] = useState({ estado: '', q: '' })
  const [modal, setModal] = useState(null)
  const [verificando, setVerificando] = useState(false)

  const cargar = useCallback(() => {
    api('/plataforma/pagos/resumen').then(setDatos).catch((e) => setError(e.message))
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const listo = (mensaje) => { setModal(null); setAviso(mensaje); cargar() }

  const verificar = async () => {
    setVerificando(true)
    try {
      const r = await api('/plataforma/pagos/procesar', { method: 'POST', body: {} })
      const partes = []
      if (r.generadas) partes.push(`${r.generadas} cuota(s) generada(s)`)
      if (r.vencidas) partes.push(`${r.vencidas} pago(s) vencido(s)`)
      if (r.suspendidas.length) partes.push(`suspendidas: ${r.suspendidas.map((i) => i.nombre).join(', ')}`)
      if (r.reactivadas.length) partes.push(`reactivadas: ${r.reactivadas.map((i) => i.nombre).join(', ')}`)
      setAviso(partes.length ? `Verificación lista: ${partes.join('; ')}.` : 'Verificación lista: no hubo cambios.')
      cargar()
    } catch (e) { setError(e.message) } finally { setVerificando(false) }
  }

  const visibles = useMemo(() => {
    if (!datos) return []
    const q = filtro.q.trim().toLowerCase()
    return datos.instituciones.filter((i) => (!filtro.estado || i.estado_cuenta === filtro.estado) && (!q || i.nombre.toLowerCase().includes(q)))
  }, [datos, filtro])

  return (
    <section className="panel">
      <div className="barra-acciones">
        <p className="texto-suave">Abonos de los colegios: lo cobrado, lo pendiente y lo vencido. Registrá cada pago cuando lo recibas.</p>
        <div className="acciones-linea">
          <button type="button" className="btn btn-secundario" onClick={verificar} disabled={verificando}>{verificando ? 'Verificando…' : 'Verificar ahora'}</button>
          <button type="button" className="btn btn-primario" onClick={() => setModal({ tipo: 'registrar' })} disabled={!datos}>Registrar pago</button>
        </div>
      </div>
      <Alerta>{error}</Alerta>
      <div aria-live="polite"><Alerta tipo="ok" onClose={() => setAviso('')}>{aviso}</Alerta></div>

      {!datos ? <Cargando /> : (
        <>
          <div className="tarjetas tarjetas-pagos">
            <div className="tarjeta-dato estatica"><span>Cobrado en {periodoTexto(datos.mes.periodo)}</span><strong className="t-ok">{pesos(datos.mes.cobrado)}</strong></div>
            <div className="tarjeta-dato estatica"><span>Por cobrar (sin vencer)</span><strong>{pesos(datos.mes.pendiente)}</strong></div>
            <div className="tarjeta-dato estatica"><span>Vencido</span><strong className={datos.mes.vencido ? 't-danger' : ''}>{pesos(datos.mes.vencido)}</strong></div>
          </div>

          <div className="filtros">
            <label className="crece">Buscar colegio
              <input type="search" value={filtro.q} onChange={(e) => setFiltro((f) => ({ ...f, q: e.target.value }))} placeholder="Nombre de la institución" />
            </label>
            <label>Estado de cuenta
              <select value={filtro.estado} onChange={(e) => setFiltro((f) => ({ ...f, estado: e.target.value }))}>
                <option value="">Todos</option>
                {ESTADOS_CUENTA.map((e) => <option key={e}>{e}</option>)}
              </select>
            </label>
          </div>

          {visibles.length === 0 ? <p className="vacio">{datos.instituciones.length ? 'Ningún colegio coincide con el filtro.' : 'Todavía no hay instituciones.'}</p> : (
            <div className="tabla-scroll">
              <table>
                <thead><tr><th>Institución</th><th>Estado de cuenta</th><th>Plan</th><th className="num">Deuda</th><th>Último pago</th><th>Próximo vencimiento</th><th>Acciones</th></tr></thead>
                <tbody>
                  {visibles.map((i) => (
                    <tr key={i.id_institucion} className={i.estado_cuenta === 'Suspendida' ? 'fila-bloqueada' : ''}>
                      <td><strong>{i.nombre}</strong>{i.prueba_finalizada && <div className="chico t-warn">Prueba terminada sin plan</div>}</td>
                      <td>
                        <Badge value={i.estado_cuenta} />
                        {i.estado_cuenta === 'Suspendida' && <div className="chico texto-suave">{i.motivo_suspension === 'Falta de pago' ? 'Por falta de pago' : 'Manual'}</div>}
                        {i.fecha_suspension && <div className="chico t-danger">Se suspende el {fecha(i.fecha_suspension)}</div>}
                      </td>
                      <td>{i.plan ? etiquetaPlan(i.plan) : '—'}<div className="chico texto-suave">{i.abono_mensual ? `${pesos(i.abono_mensual)} por mes` : 'Sin abono'}</div></td>
                      <td className="num">{i.deuda ? <strong className="t-danger">{pesos(i.deuda)}</strong> : '—'}</td>
                      <td>{fecha(i.ultimo_pago)}</td>
                      <td>{fecha(i.proximo_vencimiento)}</td>
                      <td className="acciones-fila">
                        <button type="button" className="btn-link" onClick={() => setModal({ tipo: 'registrar', institucion: i })}>Registrar pago</button>
                        <button type="button" className="btn-link" onClick={() => setModal({ tipo: 'historial', institucion: i })}>Historial</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {modal?.tipo === 'registrar' && <RegistrarPago instituciones={datos.instituciones} inicial={modal.institucion} onClose={() => setModal(null)} onListo={listo} />}
      {modal?.tipo === 'historial' && <Historial institucion={modal.institucion} onClose={() => { setModal(null); cargar() }} />}
    </section>
  )
}

// Registra un pago. Período y monto se proponen según la cuota abierta más vieja.
function RegistrarPago({ instituciones, inicial, onClose, onListo }) {
  const [idInst, setIdInst] = useState(inicial ? String(inicial.id_institucion) : '')
  const [abiertos, setAbiertos] = useState([])
  const [f, setF] = useState({ concepto: 'Abono', periodo: hoyAR().slice(0, 7), monto: '', fecha_pago: hoyAR(), medio: 'Transferencia', referencia: '', nro_factura: '', notas: '' })
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.value }))

  // Al elegir la institución se buscan sus cuotas abiertas para proponer período y monto.
  useEffect(() => {
    if (!idInst) return undefined
    let vivo = true
    api('/plataforma/pagos', { params: { institucion: idInst } })
      .then((lista) => {
        if (!vivo) return
        const ab = lista.filter((p) => p.estado === 'Pendiente' || p.estado === 'Vencido').sort((x, y) => x.periodo.localeCompare(y.periodo))
        setAbiertos(ab)
        const inst = instituciones.find((i) => String(i.id_institucion) === String(idInst))
        if (ab[0]) setF((v) => ({ ...v, concepto: ab[0].concepto, periodo: ab[0].periodo, monto: String(ab[0].monto) }))
        else setF((v) => ({ ...v, concepto: 'Abono', periodo: hoyAR().slice(0, 7), monto: inst?.abono_mensual ? String(inst.abono_mensual) : '' }))
      })
      .catch((e) => { if (vivo) setError(e.message) })
    return () => { vivo = false }
  }, [idInst, instituciones])
  const elegir = (id) => { setIdInst(id); setAbiertos([]) }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!idInst) return setError('Elegí la institución.')
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(f.periodo)) return setError('Elegí el mes que se paga.')
    setEnviando(true)
    try {
      const r = await api('/plataforma/pagos', {
        method: 'POST',
        body: { id_institucion: Number(idInst), concepto: f.concepto, periodo: f.periodo, monto: f.monto === '' ? undefined : Number(f.monto), fecha_pago: f.fecha_pago, medio: f.medio, referencia: f.referencia, nro_factura: f.nro_factura, notas: f.notas },
      })
      onListo(`Pago registrado: ${r.institucion}, ${etiquetaConcepto(r.concepto).toLowerCase()} de ${periodoTexto(r.periodo)} por ${pesos(r.monto)}.${r.reactivada ? ' La institución volvió a estar activa.' : ''}`)
    } catch (err) { setError(err.message); setEnviando(false) }
  }

  return (
    <Modal titulo="Registrar pago" onClose={onClose} ancho="640px">
      <form className="form" onSubmit={submit} noValidate>
        <div aria-live="assertive"><Alerta>{error}</Alerta></div>
        <label>Institución
          <select value={idInst} onChange={(e) => elegir(e.target.value)} required>
            <option value="">Elegí una institución</option>
            {instituciones.map((i) => <option key={i.id_institucion} value={i.id_institucion}>{i.nombre}</option>)}
          </select>
        </label>
        {abiertos.length > 0 && (
          <p className="texto-suave chico">Cuotas abiertas: {abiertos.map((p) => `${periodoTexto(p.periodo)} (${p.estado.toLowerCase()}, ${pesos(p.monto)})`).join(', ')}.</p>
        )}
        <div className="form-fila">
          <label>Concepto
            <select value={f.concepto} onChange={set('concepto')}>{CONCEPTOS.map((c) => <option key={c.id} value={c.id}>{c.etiqueta}</option>)}</select>
          </label>
          <label>Mes que se paga<input type="month" value={f.periodo} onChange={set('periodo')} required /></label>
          <label>Monto (ARS)<input type="number" inputMode="decimal" min="0" step="0.01" value={f.monto} onChange={set('monto')} placeholder="Según la cuota" /></label>
        </div>
        <div className="form-fila">
          <label>Fecha de pago<input type="date" value={f.fecha_pago} onChange={set('fecha_pago')} required /></label>
          <label>Medio
            <select value={f.medio} onChange={set('medio')}>{MEDIOS.map((m) => <option key={m}>{m}</option>)}</select>
          </label>
        </div>
        <div className="form-fila">
          <label>Referencia u operación<input value={f.referencia} onChange={set('referencia')} maxLength={150} placeholder="Opcional" /></label>
          <label>N.º de factura<input value={f.nro_factura} onChange={set('nro_factura')} maxLength={50} placeholder="Opcional" /></label>
        </div>
        <label>Notas<textarea rows={2} value={f.notas} onChange={set('notas')} maxLength={300} placeholder="Opcional" /></label>
        <div className="form-acciones">
          <button type="button" className="btn btn-secundario" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primario" disabled={enviando}>{enviando ? 'Registrando…' : 'Registrar pago'}</button>
        </div>
      </form>
    </Modal>
  )
}

function Historial({ institucion, onClose }) {
  const [pagos, setPagos] = useState(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [editando, setEditando] = useState(null)
  const cargar = useCallback(() => {
    api('/plataforma/pagos', { params: { institucion: institucion.id_institucion } }).then(setPagos).catch((e) => setError(e.message))
  }, [institucion.id_institucion])
  useEffect(() => { cargar() }, [cargar])

  return (
    <Modal titulo={`Pagos de ${institucion.nombre}`} onClose={onClose} ancho="860px">
      <div className="form">
        <Alerta>{error}</Alerta>
        <div aria-live="polite"><Alerta tipo="ok" onClose={() => setAviso('')}>{aviso}</Alerta></div>
        {editando ? (
          <EditarPago pago={editando.pago} anular={editando.anular} onCancelar={() => setEditando(null)}
            onListo={(m) => { setEditando(null); setAviso(m); cargar() }} />
        ) : !pagos ? <Cargando /> : pagos.length === 0 ? <p className="vacio">Todavía no hay pagos de esta institución.</p> : (
          <div className="tabla-scroll">
            <table>
              <thead><tr><th>Período</th><th>Concepto</th><th className="num">Monto</th><th>Vence</th><th>Estado</th><th>Pago</th><th>Acciones</th></tr></thead>
              <tbody>
                {pagos.map((p) => (
                  <tr key={p.id_pago}>
                    <td>{periodoTexto(p.periodo)}</td>
                    <td>{etiquetaConcepto(p.concepto)}</td>
                    <td className="num">{pesos(p.monto)}</td>
                    <td>{fecha(p.fecha_vencimiento)}</td>
                    <td><Badge value={p.estado} />{p.estado === 'Anulado' && p.notas && <div className="chico texto-suave">{p.notas}</div>}</td>
                    <td className="chico">
                      {p.fecha_pago ? <>{fecha(p.fecha_pago)}, {p.medio}</> : '—'}
                      {p.referencia && <div className="texto-suave">Ref. {p.referencia}</div>}
                      {p.nro_factura && <div className="texto-suave">Factura {p.nro_factura}</div>}
                    </td>
                    <td className="acciones-fila">
                      {p.estado !== 'Anulado' && <>
                        <button type="button" className="btn-link" onClick={() => setEditando({ pago: p })}>Corregir</button>
                        <button type="button" className="btn-link peligro" onClick={() => setEditando({ pago: p, anular: true })}>Anular</button>
                      </>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!editando && <div className="form-acciones"><button type="button" className="btn btn-secundario" onClick={onClose}>Cerrar</button></div>}
      </div>
    </Modal>
  )
}

function EditarPago({ pago, anular, onCancelar, onListo }) {
  const [f, setF] = useState({
    monto: String(pago.monto), fecha_vencimiento: pago.fecha_vencimiento?.slice(0, 10) || '', fecha_pago: pago.fecha_pago?.slice(0, 10) || '',
    medio: pago.medio || '', referencia: pago.referencia || '', nro_factura: pago.nro_factura || '', notas: anular ? '' : (pago.notas || ''),
    estado: pago.estado === 'Pagado' ? 'Pagado' : 'Pendiente',
  })
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.value }))
  const nombre = `${etiquetaConcepto(pago.concepto).toLowerCase()} de ${periodoTexto(pago.periodo)}`

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (anular && !f.notas.trim()) return setError('Escribí el motivo de la anulación.')
    setEnviando(true)
    try {
      const body = anular
        ? { estado: 'Anulado', notas: f.notas }
        : {
          monto: Number(f.monto), fecha_vencimiento: f.fecha_vencimiento, estado: f.estado,
          ...(f.estado === 'Pagado' ? { fecha_pago: f.fecha_pago || null, medio: f.medio || null } : {}),
          referencia: f.referencia, nro_factura: f.nro_factura, notas: f.notas,
        }
      const r = await api(`/plataforma/pagos/${pago.id_pago}`, { method: 'PATCH', body })
      onListo(`${anular ? 'Anulado' : 'Corregido'}: ${nombre}.${r.reactivada ? ' La institución volvió a estar activa.' : ''}${r.suspendida ? ' La institución quedó suspendida por falta de pago.' : ''}`)
    } catch (err) { setError(err.message); setEnviando(false) }
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <h3>{anular ? 'Anular' : 'Corregir'} {nombre}</h3>
      <div aria-live="assertive"><Alerta>{error}</Alerta></div>
      {anular ? (
        <>
          <p className="texto-suave">El pago queda en el historial como anulado y deja de contar como deuda o como cobrado.</p>
          <label>Motivo de la anulación<textarea rows={2} value={f.notas} onChange={set('notas')} maxLength={300} required /></label>
        </>
      ) : (
        <>
          <div className="form-fila">
            <label>Monto (ARS)<input type="number" min="0" step="0.01" value={f.monto} onChange={set('monto')} /></label>
            <label>Vence<input type="date" value={f.fecha_vencimiento} onChange={set('fecha_vencimiento')} /></label>
            <label>Estado
              <select value={f.estado} onChange={set('estado')}><option value="Pendiente">Sin pagar</option><option value="Pagado">Pagado</option></select>
            </label>
          </div>
          {f.estado === 'Pagado' && (
            <div className="form-fila">
              <label>Fecha de pago<input type="date" value={f.fecha_pago} onChange={set('fecha_pago')} /></label>
              <label>Medio<select value={f.medio} onChange={set('medio')}><option value="">Elegí</option>{MEDIOS.map((m) => <option key={m}>{m}</option>)}</select></label>
            </div>
          )}
          <div className="form-fila">
            <label>Referencia u operación<input value={f.referencia} onChange={set('referencia')} maxLength={150} /></label>
            <label>N.º de factura<input value={f.nro_factura} onChange={set('nro_factura')} maxLength={50} /></label>
          </div>
          <label>Notas<textarea rows={2} value={f.notas} onChange={set('notas')} maxLength={300} /></label>
          <p className="texto-suave chico">Para dar más plazo a un colegio, cambiá la fecha de vencimiento: los días de gracia corren desde esa fecha.</p>
        </>
      )}
      <div className="form-acciones">
        <button type="button" className="btn btn-secundario" onClick={onCancelar}>Volver</button>
        <button className={`btn ${anular ? 'btn-peligro' : 'btn-primario'}`} disabled={enviando}>{enviando ? 'Guardando…' : anular ? 'Anular pago' : 'Guardar cambios'}</button>
      </div>
    </form>
  )
}
