import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { topologyApi, physicalApi } from '../utils/api'
import { Network, Trash2, Eye, Clock, Plus, Cpu } from 'lucide-react'
import toast from 'react-hot-toast'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const TABS = [
  { key: 'ospf',     label: 'Topologia OSPF',    icon: Network, color: 'accent' },
  { key: 'physical', label: 'Topologia Física',   icon: Cpu,     color: 'blue-400' },
]

export default function HomePage() {
  const [tab, setTab]               = useState('ospf')
  const [topologies, setTopologies] = useState([])
  const [physTopos, setPhysTopos]   = useState([])
  const [loading, setLoading]       = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    Promise.all([topologyApi.list(), physicalApi.listTopologies()])
      .then(([o, p]) => { setTopologies(o.data); setPhysTopos(p.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleDelete = async (id, e) => {
    e.preventDefault(); e.stopPropagation()
    if (!confirm('Remover topologia?')) return
    await topologyApi.delete(id)
    setTopologies(prev => prev.filter(t => t.id !== id))
    toast.success('Removida')
  }

  const handleDeletePhysical = async (id, e) => {
    e.preventDefault(); e.stopPropagation()
    if (!confirm('Remover topologia física?')) return
    await physicalApi.deleteTopology(id)
    setPhysTopos(prev => prev.filter(t => t.id !== id))
    toast.success('Removida')
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-xs font-mono text-accent mb-1">// NETVIS</div>
          <h1 className="text-2xl font-bold">Suas Redes</h1>
        </div>
        {tab === 'ospf' && (
          <div className="flex gap-2">
            <Link to="/upload" className="flex items-center gap-2 px-4 py-2 border border-accent text-accent text-sm font-mono hover:bg-accent/10 transition-all">
              <Plus size={14} /> Upload LSDB
            </Link>
            <Link to="/create" className="flex items-center gap-2 px-4 py-2 bg-accent text-bg text-sm font-mono hover:bg-accent/90 transition-all">
              <Plus size={14} /> Criar Manual
            </Link>
          </div>
        )}
        {tab === 'physical' && (
          <Link to="/physical" className="flex items-center gap-2 px-4 py-2 bg-accent text-bg text-sm font-mono hover:bg-accent/90 transition-all">
            <Cpu size={14} /> Gerenciar Física
          </Link>
        )}
      </div>

      {/* Tab selector */}
      <div className="flex border-b border-border mb-6">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-5 py-2.5 text-sm font-mono border-b-2 transition-all
              ${tab === key ? 'text-accent border-accent' : 'text-muted border-transparent hover:text-white'}`}>
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="text-center text-muted font-mono text-sm py-12 animate-pulse">// carregando...</div>
      )}

      {/* OSPF topologies */}
      {!loading && tab === 'ospf' && (
        <>
          {topologies.length === 0 ? (
            <div className="border border-dashed border-border p-16 text-center">
              <Network size={32} className="text-muted mx-auto mb-4" />
              <p className="text-muted font-mono text-sm mb-4">Nenhuma topologia OSPF ainda.</p>
              <div className="flex gap-3 justify-center">
                <Link to="/upload" className="px-4 py-2 border border-accent text-accent text-sm font-mono hover:bg-accent/10">Upload LSDB</Link>
                <Link to="/create" className="px-4 py-2 bg-accent text-bg text-sm font-mono">Criar Manual</Link>
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              {topologies.map(t => (
                <Link key={t.id} to={`/topology/${t.id}`}
                  className="group block border border-border bg-card hover:border-accent/50 transition-all p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 border border-accent/30 bg-accent/5 flex items-center justify-center shrink-0">
                        <Network size={18} className="text-accent" />
                      </div>
                      <div>
                        <h2 className="font-bold text-white group-hover:text-accent transition-colors">{t.name}</h2>
                        <p className="text-xs font-mono text-muted mt-0.5">{t.protocol?.toUpperCase()} · Área {t.area}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right hidden sm:block">
                        <p className="text-sm font-mono text-white">{t.node_count} <span className="text-muted text-xs">nós</span></p>
                        <p className="text-sm font-mono text-white">{t.edge_count} <span className="text-muted text-xs">links</span></p>
                      </div>
                      <div className="flex gap-2">
                        <button className="p-2 border border-border text-muted hover:border-accent hover:text-accent transition-all"
                          onClick={e => { e.preventDefault(); navigate(`/topology/${t.id}`) }}>
                          <Eye size={14} />
                        </button>
                        <button className="p-2 border border-border text-muted hover:border-red-500 hover:text-red-400 transition-all"
                          onClick={e => handleDelete(t.id, e)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 mt-3 text-xs font-mono text-muted">
                    <Clock size={11} />
                    <span>{formatDistanceToNow(new Date(t.created_at), { addSuffix: true, locale: ptBR })}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {/* Physical topologies */}
      {!loading && tab === 'physical' && (
        <>
          {physTopos.length === 0 ? (
            <div className="border border-dashed border-border p-16 text-center">
              <Cpu size={32} className="text-muted mx-auto mb-4" />
              <p className="text-muted font-mono text-sm mb-4">Nenhuma topologia física ainda.</p>
              <p className="text-muted font-mono text-xs mb-6">Adicione dispositivos e inicie um crawl SNMP/LLDP.</p>
              <Link to="/physical" className="px-4 py-2 bg-accent text-bg text-sm font-mono">Configurar dispositivos</Link>
            </div>
          ) : (
            <div className="grid gap-4">
              {physTopos.map(t => (
                <Link key={t.id} to="/physical"
                  className="group block border border-border bg-card hover:border-blue-500/50 transition-all p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 border border-blue-500/30 bg-blue-500/5 flex items-center justify-center shrink-0">
                        <Cpu size={18} className="text-blue-400" />
                      </div>
                      <div>
                        <h2 className="font-bold text-white group-hover:text-blue-400 transition-colors">{t.name}</h2>
                        <p className="text-xs font-mono text-muted mt-0.5">
                          LLDP · {new Date(t.crawled_at).toLocaleString('pt-BR')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {t.meta && (
                        <div className="text-right hidden sm:block">
                          <p className="text-sm font-mono text-white">{t.meta.nodes_discovered} <span className="text-muted text-xs">nós</span></p>
                          <p className="text-sm font-mono text-white">{t.meta.links_discovered} <span className="text-muted text-xs">links</span></p>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button className="p-2 border border-border text-muted hover:border-blue-500 hover:text-blue-400 transition-all"
                          onClick={e => { e.preventDefault(); navigate('/physical') }}>
                          <Eye size={14} />
                        </button>
                        <button className="p-2 border border-border text-muted hover:border-red-500 hover:text-red-400 transition-all"
                          onClick={e => handleDeletePhysical(t.id, e)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
