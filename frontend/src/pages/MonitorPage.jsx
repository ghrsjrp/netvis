import { useState, useEffect, useRef } from 'react'
import { topologyApi } from '../utils/api'
import toast from 'react-hot-toast'
import { Radio, Plus, RefreshCw } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const EVENT_COLORS = {
  link_down: 'text-accent3 border-accent3/30 bg-accent3/5',
  link_up: 'text-accent border-accent/30 bg-accent/5',
  node_down: 'text-warn border-warn/30 bg-warn/5',
  node_up: 'text-accent border-accent/30 bg-accent/5',
  cost_change: 'text-accent2 border-accent2/30 bg-accent2/5',
}

const EVENT_ICONS = {
  link_down: '🔴', link_up: '🟢', node_down: '⚠️', node_up: '✅', cost_change: '🔄'
}

export default function MonitorPage() {
  const [topologies, setTopologies] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const timerRef = useRef(null)

  // New event form
  const [form, setForm] = useState({
    type: 'link_down', edge_from: '', edge_to: '', node: '', old_cost: '', new_cost: '', message: ''
  })

  useEffect(() => {
    topologyApi.list().then(r => {
      setTopologies(r.data)
      if (r.data.length > 0) setSelectedId(r.data[0].id)
    })
  }, [])

  useEffect(() => {
    if (selectedId) fetchEvents()
  }, [selectedId])

  useEffect(() => {
    if (autoRefresh && selectedId) {
      timerRef.current = setInterval(fetchEvents, 5000)
    }
    return () => clearInterval(timerRef.current)
  }, [autoRefresh, selectedId])

  const fetchEvents = async () => {
    if (!selectedId) return
    setLoading(true)
    try {
      const r = await topologyApi.events(selectedId)
      setEvents(r.data)
    } catch {}
    setLoading(false)
  }

  const addEvent = async () => {
    if (!selectedId) return toast.error('Selecione uma topologia')
    const payload = { type: form.type, message: form.message || undefined }
    if (form.type.includes('link')) {
      payload.edge_from = form.edge_from
      payload.edge_to = form.edge_to
    }
    if (form.type.includes('node')) {
      payload.node = form.node
    }
    if (form.type === 'cost_change') {
      payload.edge_from = form.edge_from
      payload.edge_to = form.edge_to
      payload.old_cost = parseInt(form.old_cost) || undefined
      payload.new_cost = parseInt(form.new_cost) || undefined
    }
    try {
      await topologyApi.addEvent(selectedId, payload)
      toast.success('Evento registrado')
      fetchEvents()
    } catch {
      toast.error('Erro ao registrar evento')
    }
  }

  const typeOptions = ['link_down', 'link_up', 'node_down', 'node_up', 'cost_change']

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="text-xs font-mono text-accent mb-1">// MONITORAMENTO</div>
          <h1 className="text-2xl font-bold">Dashboard de Eventos</h1>
        </div>
        <div className="flex gap-2 items-center">
          <button onClick={fetchEvents}
            className="flex items-center gap-1.5 px-3 py-2 border border-border text-muted text-xs font-mono hover:border-accent hover:text-accent transition-all">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Atualizar
          </button>
          <button onClick={() => setAutoRefresh(a => !a)}
            className={`flex items-center gap-1.5 px-3 py-2 border text-xs font-mono transition-all
              ${autoRefresh ? 'border-accent text-accent bg-accent/10' : 'border-border text-muted hover:border-accent hover:text-accent'}`}>
            <Radio size={13} /> {autoRefresh ? 'Auto ON' : 'Auto OFF'}
          </button>
        </div>
      </div>

      {/* Topology selector */}
      <div className="mb-6">
        <label className="block text-xs font-mono text-muted mb-2">Topologia</label>
        <div className="flex gap-2 flex-wrap">
          {topologies.map(t => (
            <button key={t.id} onClick={() => setSelectedId(t.id)}
              className={`px-3 py-1.5 text-xs font-mono border transition-all
                ${selectedId === t.id ? 'border-accent text-accent bg-accent/10' : 'border-border text-muted hover:border-accent/50'}`}>
              {t.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Event form */}
        <div className="border border-border bg-card p-4">
          <p className="text-xs font-mono text-muted mb-4 border-b border-border pb-2">// REGISTRAR EVENTO</p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-mono text-muted mb-1">Tipo</label>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                className="w-full bg-bg border border-border px-2 py-1.5 text-xs font-mono text-white focus:border-accent focus:outline-none">
                {typeOptions.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>

            {(form.type.includes('link') || form.type === 'cost_change') && (
              <>
                <div>
                  <label className="block text-xs font-mono text-muted mb-1">De</label>
                  <input value={form.edge_from} onChange={e => setForm(p => ({ ...p, edge_from: e.target.value }))}
                    placeholder="10.0.0.1"
                    className="w-full bg-bg border border-border px-2 py-1.5 text-xs font-mono text-white focus:border-accent focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-mono text-muted mb-1">Para</label>
                  <input value={form.edge_to} onChange={e => setForm(p => ({ ...p, edge_to: e.target.value }))}
                    placeholder="10.0.0.2"
                    className="w-full bg-bg border border-border px-2 py-1.5 text-xs font-mono text-white focus:border-accent focus:outline-none" />
                </div>
              </>
            )}

            {form.type.includes('node') && (
              <div>
                <label className="block text-xs font-mono text-muted mb-1">Nó</label>
                <input value={form.node} onChange={e => setForm(p => ({ ...p, node: e.target.value }))}
                  placeholder="10.0.0.1"
                  className="w-full bg-bg border border-border px-2 py-1.5 text-xs font-mono text-white focus:border-accent focus:outline-none" />
              </div>
            )}

            {form.type === 'cost_change' && (
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-mono text-muted mb-1">Custo ant.</label>
                  <input value={form.old_cost} onChange={e => setForm(p => ({ ...p, old_cost: e.target.value }))}
                    type="number" placeholder="10"
                    className="w-full bg-bg border border-border px-2 py-1.5 text-xs font-mono text-white focus:border-accent focus:outline-none" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-mono text-muted mb-1">Custo novo</label>
                  <input value={form.new_cost} onChange={e => setForm(p => ({ ...p, new_cost: e.target.value }))}
                    type="number" placeholder="20"
                    className="w-full bg-bg border border-border px-2 py-1.5 text-xs font-mono text-white focus:border-accent focus:outline-none" />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-mono text-muted mb-1">Mensagem (opcional)</label>
              <input value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
                placeholder="Descrição..."
                className="w-full bg-bg border border-border px-2 py-1.5 text-xs font-mono text-white focus:border-accent focus:outline-none" />
            </div>

            <button onClick={addEvent}
              className="w-full py-2 bg-accent text-bg font-mono font-bold text-xs hover:bg-accent/90 transition-all flex items-center justify-center gap-1.5">
              <Plus size={13} /> Registrar
            </button>
          </div>
        </div>

        {/* Events feed */}
        <div className="lg:col-span-2 border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-4 border-b border-border pb-2">
            <p className="text-xs font-mono text-muted">// FEED DE EVENTOS ({events.length})</p>
            {autoRefresh && <span className="text-xs font-mono text-accent animate-pulse">● live</span>}
          </div>

          {events.length === 0 && (
            <div className="text-center py-8 text-muted font-mono text-xs">
              Nenhum evento registrado
            </div>
          )}

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {events.map((ev, i) => (
              <div key={i} className={`flex items-start gap-3 p-3 border text-xs font-mono ${EVENT_COLORS[ev.type] || 'text-white border-border'}`}>
                <span className="text-base shrink-0">{EVENT_ICONS[ev.type] || '📌'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold uppercase">{ev.type.replace(/_/g, ' ')}</span>
                    <span className="text-muted text-xs shrink-0">
                      {formatDistanceToNow(new Date(ev.timestamp), { addSuffix: true, locale: ptBR })}
                    </span>
                  </div>
                  {(ev.edge_from || ev.edge_to) && (
                    <p className="text-muted mt-0.5">{ev.edge_from} ↔ {ev.edge_to}</p>
                  )}
                  {ev.node && <p className="text-muted mt-0.5">Nó: {ev.node}</p>}
                  {ev.old_cost && ev.new_cost && (
                    <p className="text-muted mt-0.5">Custo: {ev.old_cost} → {ev.new_cost}</p>
                  )}
                  {ev.message && <p className="text-white mt-0.5">{ev.message}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
