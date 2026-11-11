import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { Alerta, Badge, Cargando, fecha } from '../components/ui.jsx'
import { etiquetaConcepto, periodoTexto, pesos } from './pagos/formato.js'
import DatosDePago from '../components/DatosDePago.jsx'

// "Mi plan" (solo el ADMINISTRADOR del colegio): plan, abono, próximo vencimiento, cómo pagar y
// los últimos pagos. Es de solo lectura: los pagos los registra ControlTech.
export default function MiPlan() {
  const [plan, setPlan] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { api('/institucion/plan').then(setPlan).catch((e) => setError(e.message)) }, [])

  if (error) return <Alerta>{error}</Alerta>
  if (!plan) return <Cargando />
  const d = plan.datos_pago
  const hayDatos = d.alias || d.cbu || d.link

  return (
    <div className="mi-plan">
      <section className="panel">
        <div className="mi-plan-cabecera">
          <div>
            <h2>{plan.plan_etiqueta ? `Plan ${plan.plan_etiqueta}` : 'Sin plan asignado'}</h2>
            <p className="texto-suave">{plan.abono_mensual ? `${pesos(plan.abono_mensual)} por mes, vence el día ${plan.dia_vencimiento} de cada mes.` : 'ControlTech todavía no cargó el abono de tu colegio.'}</p>
          </div>
          <Badge value={plan.estado_cuenta} />
        </div>
        <dl className="datos datos-ficha">
          <div><dt>Próximo vencimiento</dt><dd>{fecha(plan.proximo_vencimiento)}</dd></div>
          <div><dt>Deuda vencida</dt><dd className={plan.deuda ? 't-danger' : ''}>{plan.deuda ? pesos(plan.deuda) : 'No hay'}</dd></div>
          <div><dt>Último pago</dt><dd>{fecha(plan.ultimo_pago)}</dd></div>
          <div><dt>Días de gracia</dt><dd>{plan.dias_gracia} días después del vencimiento</dd></div>
        </dl>
        {plan.fecha_suspension && (
          <p className="alerta alerta-error" role="status">Si el pago no se registra, el acceso del colegio se suspende el {fecha(plan.fecha_suspension)}. Tus datos no se borran.</p>
        )}
      </section>

      <section className="panel">
        <h2>Cómo pagar</h2>
        {!hayDatos ? <p className="texto-suave">Consultá a ControlTech{d.contacto ? ` (${d.contacto})` : ''} cómo pagar el abono.</p> : (
          <DatosDePago datos={d} />
        )}
        <p className="texto-suave chico">Después de pagar, enviá el comprobante{d.contacto ? ` a ${d.contacto}` : ' a ControlTech'}. El pago se ve acá cuando ControlTech lo registra.</p>
      </section>

      <section className="panel">
        <h2>Últimos pagos</h2>
        {plan.pagos.length === 0 ? <p className="vacio">Todavía no hay pagos registrados.</p> : (
          <div className="tabla-scroll">
            <table>
              <thead><tr><th>Período</th><th>Concepto</th><th className="num">Monto</th><th>Vence</th><th>Estado</th><th>Pagado el</th></tr></thead>
              <tbody>
                {plan.pagos.map((p) => (
                  <tr key={p.id_pago}>
                    <td>{periodoTexto(p.periodo)}</td>
                    <td>{etiquetaConcepto(p.concepto)}</td>
                    <td className="num">{pesos(p.monto)}</td>
                    <td>{fecha(p.fecha_vencimiento)}</td>
                    <td><Badge value={p.estado} /></td>
                    <td>{p.fecha_pago ? `${fecha(p.fecha_pago)}${p.medio ? `, ${p.medio}` : ''}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
