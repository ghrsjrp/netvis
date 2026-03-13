import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { physicalApi, topologyApi } from '../utils/api'
import { GitBranch, FolderOpen, Folder, Plus, Clock, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

export default function TopologyIndexPage() {
  const [clients, setClients]   = useState([])  // [{name, deviceCount, physTopos:[], ospfTopos:[]}]
  const [loading, setLoading]   = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName]   = useState('')
  const navigate = useNavigate()

  const load = async () => {
    try {
      const [gr, devs, physTopos, ospfTopos] = await Promise.all([
        physicalApi.listGroups(),
        physicalApi.listDevices(),
        physicalApi.listTopologies(),
        topologyApi.list(),
      ])

      // Collect all group names (from physical groups + ospf client_groups)
      const nameSet = new Set()
      gr.data.filter(g => g.group).forEach(g => nameSet.add(g.group))
      ospfTopos.data.filter(t => t.client_group).forEach(t => nameSet.add(t.client_group))

      const list = [...nameSet].map(name => ({
        name,
        deviceCount: devs.data.filter(d => d.group_name === name).length,
        physTopos:   physTopos.data.filter(t => t.group_name === name),
        ospfTopos:   ospfTopos.data.filter(t => t.client_group === name),
      }))

      setClients(list)
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const createClient = () => {
    const name = newName.trim()
    if (!name) return
    setCreating(false); setNewName('')
    navigate(`/topology/client/${encodeURIComponent(name)}`)
    toast.success(`Cliente "${name}" criado`)
  }

  const deleteClient = async (name, e) => {
    e.stopPropagation()
    if (!confirm(`Remover cliente "${name}" e todos seus dispositivos?`)) return
    try {
      const devs = await physicalApi.listDevices()
      await Promise.all(devs.data.filter(d => d.group_name === name).map(d => physicalApi.deleteDevice(d.id)))
      await load()
      toast.success(`"${name}" removido`)
    } catch { toast.error('Erro ao remover') }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="text-xs font-mono text-accent mb-1">// CLIENTES</div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <GitBranch size={22} className="text-accent" /> Topologia
          </h1>
          <p className="text-muted text-sm mt-1 font-mono">Gerencie equipamentos, topologia física e OSPF por cliente</p>
        </div>
        <button onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-bg text-sm font-mono font-bold hover:bg-accent/90 transition-all">
          <Plus size={14} /> Novo Cliente
        </button>
      </div>

      {creating && (
        <div className="mb-6 p-4 border border-accent/50 bg-accent/5 flex items-center gap-3">
          <Folder size={18} className="text-accent shrink-0" />
          <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') createClient(); if (e.key === 'Escape') setCreating(false) }}
            placeholder="Nome do cliente (ex: Conect BA)"
            className="flex-1 bg-transparent border-b border-accent text-white font-mono text-sm px-1 py-0.5 focus:outline-none" />
          <button onClick={createClient} disabled={!newName.trim()}
            className="px-4 py-1.5 bg-accent text-bg font-mono text-sm font-bold disabled:opacity-40">Criar</button>
          <button onClick={() => setCreating(false)} className="px-3 py-1.5 text-muted font-mono text-sm hover:text-white">Cancelar</button>
        </div>
      )}

      {loading ? (
        <p className="text-center text-muted font-mono text-sm py-16 animate-pulse">// carregando...</p>
      ) : clients.length === 0 ? (
        <div className="border border-dashed border-border p-16 text-center">
          <GitBranch size={40} className="text-muted mx-auto mb-4" />
          <p className="text-muted font-mono text-sm mb-2">Nenhum cliente cadastrado.</p>
          <button onClick={() => setCreating(true)}
            className="px-4 py-2 border border-accent text-accent font-mono text-sm hover:bg-accent/10 transition-all mt-4">
            <Plus size={13} className="inline mr-1" /> Criar primeiro cliente
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {clients.map(({ name, deviceCount, physTopos, ospfTopos }) => (
            <div key={name}
              onClick={() => navigate(`/topology/client/${encodeURIComponent(name)}`)}
              className="group border border-border bg-card hover:border-accent/50 transition-all p-5 cursor-pointer">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 border border-accent/30 bg-accent/5 flex items-center justify-center shrink-0">
                  <FolderOpen size={18} className="text-accent" />
                </div>
                <div className="flex-1">
                  <h2 className="font-bold text-white group-hover:text-accent transition-colors">{name}</h2>
                  <div className="flex items-center gap-4 mt-1">
                    <span className="text-xs font-mono text-muted">
                      {deviceCount} {deviceCount === 1 ? 'equipamento' : 'equipamentos'}
                    </span>
                    <span className={`text-xs font-mono ${physTopos.length > 0 ? 'text-accent' : 'text-muted'}`}>
                      {physTopos.length > 0 ? `✓ Física` : '— Sem física'}
                    </span>
                    <span className={`text-xs font-mono ${ospfTopos.length > 0 ? 'text-accent' : 'text-muted'}`}>
                      {ospfTopos.length > 0 ? `✓ OSPF (${ospfTopos.length})` : '— Sem OSPF'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {physTopos.length > 0 && (
                    <span className="text-xs font-mono text-muted flex items-center gap-1">
                      <Clock size={10} />
                      {new Date(physTopos[0].crawled_at).toLocaleDateString('pt-BR')}
                    </span>
                  )}
                  <button onClick={e => deleteClient(name, e)}
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
