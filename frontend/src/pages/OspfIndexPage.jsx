import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { topologyApi, physicalApi } from '../utils/api'
import { Network, Plus, Trash2, FolderOpen, Folder, Clock } from 'lucide-react'
import toast from 'react-hot-toast'

export default function OspfIndexPage() {
  const [groups, setGroups]     = useState([])   // [{name, topos:[]}]
  const [ungrouped, setUngrouped] = useState([])
  const [loading, setLoading]   = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName]   = useState('')
  const [expanded, setExpanded] = useState({})  // {groupName: bool}
  const navigate = useNavigate()

  const load = async () => {
    try {
      const [t, g] = await Promise.all([topologyApi.list(), physicalApi.listGroups()])
      const allTopos = t.data
      const physGroups = g.data.filter(x => x.group).map(x => x.group)

      // Build groups from client_group field + physical groups
      const groupMap = {}
      const ung = []
      for (const topo of allTopos) {
        if (topo.client_group) {
          if (!groupMap[topo.client_group]) groupMap[topo.client_group] = []
          groupMap[topo.client_group].push(topo)
        } else {
          ung.push(topo)
        }
      }
      // Also include physical groups that have no OSPF topos yet
      for (const pg of physGroups) {
        if (!groupMap[pg]) groupMap[pg] = []
      }

      setGroups(Object.entries(groupMap).map(([name, topos]) => ({ name, topos })))
      setUngrouped(ung)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const createGroup = () => {
    const name = newName.trim()
    if (!name) return
    setCreating(false); setNewName('')
    setGroups(g => g.find(x => x.name === name) ? g : [...g, { name, topos: [] }])
    navigate(`/ospf/client/${encodeURIComponent(name)}`)
    toast.success(`Pasta "${name}" criada`)
  }

  const handleDelete = async (id, e) => {
    e.stopPropagation()
    if (!confirm('Remover topologia?')) return
    await topologyApi.delete(id)
    await load()
    toast.success('Removida')
  }

  const renderTopoCard = (t) => (
    <div key={t.id} onClick={() => navigate(`/topology/${t.id}`)}
      className="group flex items-center gap-3 p-3 border border-border bg-card hover:border-accent/50 transition-all cursor-pointer">
      <div className="w-7 h-7 border border-accent/30 bg-accent/5 flex items-center justify-center shrink-0">
        <Network size={12} className="text-accent" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-white group-hover:text-accent transition-colors text-sm truncate">{t.name}</p>
        <p className="text-xs font-mono text-muted">
          {t.protocol?.toUpperCase()} · Área {t.area} · {t.node_count} nós · {t.edge_count} links
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs font-mono text-muted flex items-center gap-1">
          <Clock size={10} />
          {new Date(t.created_at).toLocaleDateString('pt-BR')}
        </span>
        <button onClick={e => handleDelete(t.id, e)}
          className="p-1.5 border border-border text-muted hover:border-red-500 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100">
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  )

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="text-xs font-mono text-accent mb-1">// OSPF</div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Network size={22} className="text-accent" /> Topologia OSPF
          </h1>
          <p className="text-muted text-sm mt-1 font-mono">Organize por cliente e importe a LSDB para visualizar</p>
        </div>
        <button onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-bg text-sm font-mono font-bold hover:bg-accent/90 transition-all">
          <Plus size={14} /> Novo Cliente
        </button>
      </div>

      {/* Create inline */}
      {creating && (
        <div className="mb-6 p-4 border border-accent/50 bg-accent/5 flex items-center gap-3">
          <Folder size={18} className="text-accent shrink-0" />
          <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') createGroup(); if (e.key === 'Escape') setCreating(false) }}
            placeholder="Nome do cliente (ex: Conect BA)"
            className="flex-1 bg-transparent border-b border-accent text-white font-mono text-sm px-1 py-0.5 focus:outline-none" />
          <button onClick={createGroup} disabled={!newName.trim()}
            className="px-4 py-1.5 bg-accent text-bg font-mono text-sm font-bold disabled:opacity-40">Criar</button>
          <button onClick={() => setCreating(false)} className="px-3 py-1.5 text-muted font-mono text-sm hover:text-white">Cancelar</button>
        </div>
      )}

      {loading ? (
        <p className="text-center text-muted font-mono text-sm py-16 animate-pulse">// carregando...</p>
      ) : (groups.length === 0 && ungrouped.length === 0) ? (
        <div className="border border-dashed border-border p-16 text-center">
          <Network size={40} className="text-muted mx-auto mb-4" />
          <p className="text-muted font-mono text-sm mb-2">Nenhuma topologia OSPF ainda.</p>
          <p className="text-muted font-mono text-xs mb-6">Crie uma pasta de cliente e importe a LSDB.</p>
          <button onClick={() => setCreating(true)}
            className="px-4 py-2 border border-accent text-accent font-mono text-sm hover:bg-accent/10 transition-all">
            <Plus size={13} className="inline mr-1" /> Criar primeiro cliente
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Client groups */}
          {groups.map(({ name, topos }) => (
            <div key={name} className="border border-border bg-card hover:border-accent/50 transition-all">
              {/* Group header — clique expande/colapsa */}
              <div
                onClick={() => setExpanded(e => ({ ...e, [name]: !e[name] }))}
                className="group flex items-center gap-3 p-4 cursor-pointer">
                <div className="w-10 h-10 border border-accent/30 bg-accent/5 flex items-center justify-center shrink-0">
                  <FolderOpen size={18} className="text-accent" />
                </div>
                <div className="flex-1">
                  <h2 className="font-bold text-white group-hover:text-accent transition-colors">{name}</h2>
                  <p className="text-xs font-mono text-muted mt-0.5">
                    {topos.length === 0
                      ? 'Nenhuma topologia — clique para importar LSDB'
                      : `${topos.length} ${topos.length === 1 ? 'topologia' : 'topologias'}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {topos.length === 0 && (
                    <span className="text-xs font-mono text-yellow-500 border border-yellow-700/50 px-2 py-0.5">
                      Sem LSDB
                    </span>
                  )}
                  {/* Chevron */}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    className={`text-muted transition-transform duration-200 ${expanded[name] ? 'rotate-180' : ''}`}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </div>
              </div>

              {/* Topos — expandido */}
              {expanded[name] && (
                <div className="border-t border-border px-4 pb-3 pt-2 space-y-1.5">
                  {topos.length === 0 ? (
                    <button
                      onClick={() => navigate(`/ospf/client/${encodeURIComponent(name)}`)}
                      className="w-full py-3 border border-dashed border-accent/40 text-accent font-mono text-xs hover:bg-accent/5 transition-all">
                      + Importar LSDB
                    </button>
                  ) : (
                    topos.map(renderTopoCard)
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Ungrouped */}
          {ungrouped.length > 0 && (
            <div>
              <p className="text-xs font-mono text-muted mb-2 uppercase tracking-wider">Sem cliente vinculado</p>
              <div className="space-y-2">{ungrouped.map(renderTopoCard)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
