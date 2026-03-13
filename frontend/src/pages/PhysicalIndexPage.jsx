import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { physicalApi } from '../utils/api'
import { Folder, FolderOpen, Plus, Cpu, Play, Trash2, Clock } from 'lucide-react'
import toast from 'react-hot-toast'

export default function PhysicalIndexPage() {
  const [groups, setGroups]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [newName, setNewName]       = useState('')
  const [creating, setCreating]     = useState(false)
  const navigate = useNavigate()

  const load = async () => {
    try {
      const [gr, topos] = await Promise.all([
        physicalApi.listGroups(),
        physicalApi.listTopologies(),
      ])
      // Merge: groups with their latest crawl info
      const toposByGroup = {}
      for (const t of topos.data) {
        const g = t.group_name || ''
        if (!toposByGroup[g] || new Date(t.crawled_at) > new Date(toposByGroup[g].crawled_at)) {
          toposByGroup[g] = t
        }
      }
      setGroups(gr.data.filter(g => g.group).map(g => ({
        ...g,
        lastCrawl: toposByGroup[g.group] || null,
      })))
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const createGroup = () => {
    const name = newName.trim()
    if (!name) return
    setCreating(false); setNewName('')
    // Optimistically add, then navigate
    setGroups(g => g.find(x => x.group === name) ? g : [...g, { group: name, count: 0, lastCrawl: null }])
    navigate(`/physical/client/${encodeURIComponent(name)}`)
    toast.success(`Cliente "${name}" criado`)
  }

  const deleteGroup = async (groupName, e) => {
    e.stopPropagation()
    if (!confirm(`Remover cliente "${groupName}" e todos os seus dispositivos?`)) return
    try {
      // Remove all devices in this group
      const devs = await physicalApi.listDevices()
      const groupDevs = devs.data.filter(d => d.group_name === groupName)
      await Promise.all(groupDevs.map(d => physicalApi.deleteDevice(d.id)))
      await load()
      toast.success(`Cliente "${groupName}" removido`)
    } catch { toast.error('Erro ao remover') }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="text-xs font-mono text-accent mb-1">// SNMP + LLDP</div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Cpu size={22} className="text-accent" /> Topologia Física
          </h1>
          <p className="text-muted text-sm mt-1 font-mono">Organize seus equipamentos por cliente e descubra a topologia via LLDP</p>
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
      ) : groups.length === 0 ? (
        <div className="border border-dashed border-border p-16 text-center">
          <Cpu size={40} className="text-muted mx-auto mb-4" />
          <p className="text-muted font-mono text-sm mb-2">Nenhum cliente cadastrado ainda.</p>
          <p className="text-muted font-mono text-xs mb-6">Crie uma pasta de cliente para começar a adicionar equipamentos.</p>
          <button onClick={() => setCreating(true)}
            className="px-4 py-2 border border-accent text-accent font-mono text-sm hover:bg-accent/10 transition-all">
            <Plus size={13} className="inline mr-1" /> Criar primeiro cliente
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {groups.map(({ group, count, lastCrawl }) => (
            <div key={group}
              onClick={() => navigate(`/physical/client/${encodeURIComponent(group)}`)}
              className="group border border-border bg-card hover:border-accent/50 transition-all p-5 cursor-pointer">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 border border-accent/30 bg-accent/5 flex items-center justify-center shrink-0">
                    <FolderOpen size={18} className="text-accent" />
                  </div>
                  <div>
                    <h2 className="font-bold text-white group-hover:text-accent transition-colors text-lg">{group}</h2>
                    <p className="text-xs font-mono text-muted mt-0.5">
                      {count} {count === 1 ? 'dispositivo' : 'dispositivos'}
                      {lastCrawl && ` · ${lastCrawl.meta?.nodes_discovered || 0} nós descobertos`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {lastCrawl && (
                    <div className="text-right hidden sm:block">
                      <p className="text-xs font-mono text-muted flex items-center gap-1">
                        <Clock size={10} /> Último crawl
                      </p>
                      <p className="text-xs font-mono text-white">
                        {new Date(lastCrawl.crawled_at).toLocaleString('pt-BR')}
                      </p>
                    </div>
                  )}
                  {!lastCrawl && count > 0 && (
                    <span className="text-xs font-mono text-yellow-500 border border-yellow-700 px-2 py-0.5">
                      Sem topologia
                    </span>
                  )}
                  <button onClick={e => deleteGroup(group, e)}
                    className="p-2 border border-transparent text-muted hover:border-red-500 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
