import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { topologyApi } from '../utils/api'
import toast from 'react-hot-toast'
import { Plus, Trash2 } from 'lucide-react'

export default function CreatePage() {
  const [name, setName] = useState('')
  const [nodes, setNodes] = useState([
    { id: '10.0.0.1', label: 'R1' },
    { id: '10.0.0.2', label: 'R2' },
    { id: '10.0.0.3', label: 'R3' },
  ])
  const [edges, setEdges] = useState([
    { from: '10.0.0.1', to: '10.0.0.2', cost: 10 },
    { from: '10.0.0.2', to: '10.0.0.3', cost: 20 },
    { from: '10.0.0.1', to: '10.0.0.3', cost: 30 },
  ])
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const addNode = () => setNodes(p => [...p, { id: '', label: '' }])
  const updateNode = (i, field, val) => setNodes(p => p.map((n, idx) => idx === i ? { ...n, [field]: val } : n))
  const removeNode = (i) => setNodes(p => p.filter((_, idx) => idx !== i))

  const addEdge = () => setEdges(p => [...p, { from: '', to: '', cost: 1 }])
  const updateEdge = (i, field, val) => setEdges(p => p.map((e, idx) => idx === i ? { ...e, [field]: val } : e))
  const removeEdge = (i) => setEdges(p => p.filter((_, idx) => idx !== i))

  const handleSubmit = async () => {
    if (!name.trim()) return toast.error('Dê um nome')
    if (nodes.some(n => !n.id)) return toast.error('Todos os nós precisam de ID')
    setLoading(true)
    try {
      const r = await topologyApi.createManual({ name, nodes, edges })
      toast.success('Topologia criada!')
      navigate(`/topology/${r.data.id}`)
    } catch (e) {
      toast.error('Erro ao criar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-8">
        <div className="text-xs font-mono text-accent mb-1">// CRIAR</div>
        <h1 className="text-2xl font-bold">Topologia Manual</h1>
      </div>

      <div className="mb-6">
        <label className="block text-xs font-mono text-muted mb-1">Nome *</label>
        <input value={name} onChange={e => setName(e.target.value)}
          placeholder="ex: Lab de Testes"
          className="w-full bg-card border border-border px-3 py-2 text-sm font-mono text-white placeholder-muted focus:border-accent focus:outline-none" />
      </div>

      {/* Nodes */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-mono text-muted">// ROTEADORES ({nodes.length})</p>
          <button onClick={addNode} className="flex items-center gap-1 text-xs font-mono text-accent border border-accent/30 px-2 py-1 hover:bg-accent/10">
            <Plus size={12} /> Adicionar
          </button>
        </div>
        <div className="space-y-2">
          {nodes.map((n, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input value={n.id} onChange={e => updateNode(i, 'id', e.target.value)}
                placeholder="ID (ex: 10.0.0.1)"
                className="flex-1 bg-card border border-border px-3 py-1.5 text-xs font-mono text-white placeholder-muted focus:border-accent focus:outline-none" />
              <input value={n.label} onChange={e => updateNode(i, 'label', e.target.value)}
                placeholder="Label (ex: R1)"
                className="flex-1 bg-card border border-border px-3 py-1.5 text-xs font-mono text-white placeholder-muted focus:border-accent focus:outline-none" />
              <button onClick={() => removeNode(i)} className="p-1.5 border border-border text-muted hover:border-accent3 hover:text-accent3 transition-all">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Edges */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-mono text-muted">// LINKS ({edges.length})</p>
          <button onClick={addEdge} className="flex items-center gap-1 text-xs font-mono text-accent border border-accent/30 px-2 py-1 hover:bg-accent/10">
            <Plus size={12} /> Adicionar
          </button>
        </div>
        <div className="space-y-2">
          {edges.map((e, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input value={e.from} onChange={ev => updateEdge(i, 'from', ev.target.value)}
                placeholder="De (ID)"
                className="flex-1 bg-card border border-border px-3 py-1.5 text-xs font-mono text-white placeholder-muted focus:border-accent focus:outline-none" />
              <span className="text-muted font-mono text-xs">↔</span>
              <input value={e.to} onChange={ev => updateEdge(i, 'to', ev.target.value)}
                placeholder="Para (ID)"
                className="flex-1 bg-card border border-border px-3 py-1.5 text-xs font-mono text-white placeholder-muted focus:border-accent focus:outline-none" />
              <input value={e.cost} onChange={ev => updateEdge(i, 'cost', parseInt(ev.target.value) || 1)}
                type="number" min={1} placeholder="Custo"
                className="w-20 bg-card border border-border px-3 py-1.5 text-xs font-mono text-white placeholder-muted focus:border-accent focus:outline-none" />
              <button onClick={() => removeEdge(i)} className="p-1.5 border border-border text-muted hover:border-accent3 hover:text-accent3 transition-all">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <button onClick={handleSubmit} disabled={loading}
        className="w-full py-3 bg-accent text-bg font-mono font-bold text-sm hover:bg-accent/90 transition-all disabled:opacity-40">
        {loading ? '// criando...' : '// CRIAR TOPOLOGIA'}
      </button>
    </div>
  )
}
