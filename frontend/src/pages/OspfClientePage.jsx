import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import { topologyApi } from '../utils/api'
import { Network, Upload, CheckCircle, Trash2, Eye, Clock, Plus } from 'lucide-react'
import toast from 'react-hot-toast'

const VENDORS = [
  { name: 'Cisco IOS',   cmd: 'show ip ospf database router\nshow ip ospf database network' },
  { name: 'Huawei',      cmd: 'display ospf lsdb router\ndisplay ospf lsdb network' },
  { name: 'Juniper',     cmd: 'show ospf database router extensive | no-more\nshow ospf database network extensive | no-more' },
  { name: 'Mikrotik',    cmd: '/routing ospf lsa print detail' },
  { name: 'Nokia',       cmd: 'show router ospf database type router detail' },
  { name: 'Fortinet',    cmd: 'get router info ospf database router lsa' },
]

function UploadArea({ clientGroup, onDone }) {
  const [file, setFile]   = useState(null)
  const [name, setName]   = useState('')
  const [area, setArea]   = useState('0.0.0.0')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const onDrop = useCallback(([f]) => {
    if (!f) return
    setFile(f)
    if (!name) setName(f.name.replace(/\.(txt|log)$/i, ''))
  }, [name])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'text/plain': ['.txt', '.log'] }, multiple: false,
  })

  const handleSubmit = async () => {
    if (!file) return toast.error('Selecione um arquivo')
    if (!name.trim()) return toast.error('Nome obrigatório')
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('name', name)
      fd.append('protocol', 'ospf')
      fd.append('area', area)
      fd.append('client_group', clientGroup)
      const r = await topologyApi.upload(fd)
      toast.success(`${r.data.graph_data?.stats?.node_count || 0} roteadores encontrados!`)
      onDone()
      navigate(`/topology/${r.data.id}`)
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erro no upload')
    } finally { setLoading(false) }
  }

  return (
    <div className="border border-border bg-card p-5 space-y-4">
      <p className="text-xs font-mono text-accent uppercase tracking-wider">Importar nova LSDB</p>

      {/* Dropzone */}
      <div {...getRootProps()} className={`border-2 border-dashed p-10 text-center cursor-pointer transition-all
        ${isDragActive ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/40'}`}>
        <input {...getInputProps()} />
        {file ? (
          <div className="flex flex-col items-center gap-2">
            <CheckCircle size={28} className="text-accent" />
            <p className="font-mono text-accent text-sm">{file.name}</p>
            <p className="text-muted text-xs">{(file.size / 1024).toFixed(1)} KB · clique para trocar</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload size={28} className="text-muted" />
            <p className="font-mono text-sm text-white">Arraste o arquivo .txt/.log ou clique para selecionar</p>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-xs font-mono text-muted block mb-1">Nome da topologia *</label>
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="ex: Backbone BA"
            className="w-full bg-surface border border-border px-3 py-2 text-sm font-mono text-white focus:border-accent focus:outline-none" />
        </div>
        <div className="w-36">
          <label className="text-xs font-mono text-muted block mb-1">Área OSPF</label>
          <input value={area} onChange={e => setArea(e.target.value)}
            className="w-full bg-surface border border-border px-3 py-2 text-sm font-mono text-white focus:border-accent focus:outline-none" />
        </div>
      </div>

      <button onClick={handleSubmit} disabled={loading || !file}
        className="w-full py-2.5 bg-accent text-bg font-mono font-bold text-sm hover:bg-accent/90 transition-all disabled:opacity-40">
        {loading ? '// processando...' : '// IMPORTAR TOPOLOGIA'}
      </button>
    </div>
  )
}

export default function OspfClientePage() {
  const { clientName } = useParams()
  const decoded = decodeURIComponent(clientName)
  const [topos, setTopos]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [showVendors, setShowVendors] = useState(false)
  const navigate = useNavigate()

  const load = async () => {
    try {
      const r = await topologyApi.list()
      setTopos(r.data.filter(t => t.client_group === decoded))
    } catch {}
    setLoading(false)
  }

  useEffect(() => { setLoading(true); load() }, [decoded])

  const handleDelete = async (id, e) => {
    e.stopPropagation()
    if (!confirm('Remover topologia?')) return
    await topologyApi.delete(id)
    setTopos(p => p.filter(t => t.id !== id))
    toast.success('Removida')
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-xs font-mono text-muted mb-1">
            <span onClick={() => navigate('/ospf')} className="hover:text-accent cursor-pointer">Topologia OSPF</span>
            <span className="mx-1">/</span>
            <span className="text-white">{decoded}</span>
          </div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Network size={18} className="text-accent" /> {decoded}
          </h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowVendors(v => !v)}
            className="px-3 py-2 border border-border text-muted text-xs font-mono hover:text-white transition-all">
            Comandos por vendor
          </button>
          <button onClick={() => setShowUpload(v => !v)}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-bg text-sm font-mono font-bold hover:bg-accent/90 transition-all">
            <Plus size={14} /> Importar LSDB
          </button>
        </div>
      </div>

      {/* Vendor commands reference */}
      {showVendors && (
        <div className="mb-6 grid grid-cols-2 gap-2">
          {VENDORS.map(v => (
            <div key={v.name} className="border border-border bg-card p-3">
              <p className="text-xs font-mono text-accent mb-1.5">{v.name}</p>
              <pre className="text-xs font-mono text-muted whitespace-pre-wrap">{v.cmd}</pre>
            </div>
          ))}
        </div>
      )}

      {/* Upload area */}
      {showUpload && (
        <div className="mb-6">
          <UploadArea clientGroup={decoded} onDone={() => { setShowUpload(false); load() }} />
        </div>
      )}

      {/* Topology list */}
      {loading ? (
        <p className="text-center text-muted font-mono text-sm py-12 animate-pulse">// carregando...</p>
      ) : topos.length === 0 && !showUpload ? (
        <div className="border border-dashed border-border p-14 text-center">
          <Network size={36} className="text-muted mx-auto mb-4" />
          <p className="text-muted font-mono text-sm mb-2">Nenhuma topologia OSPF neste cliente.</p>
          <p className="text-muted font-mono text-xs mb-6">Importe a LSDB para começar.</p>
          <button onClick={() => setShowUpload(true)}
            className="px-4 py-2 border border-accent text-accent font-mono text-sm hover:bg-accent/10 transition-all">
            <Upload size={13} className="inline mr-1" /> Importar LSDB
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {topos.map(t => (
            <div key={t.id} onClick={() => navigate(`/topology/${t.id}`)}
              className="group flex items-center gap-4 p-4 border border-border bg-card hover:border-accent/50 transition-all cursor-pointer">
              <div className="w-10 h-10 border border-accent/30 bg-accent/5 flex items-center justify-center shrink-0">
                <Network size={16} className="text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-white group-hover:text-accent transition-colors truncate">{t.name}</p>
                <p className="text-xs font-mono text-muted mt-0.5">
                  {t.protocol?.toUpperCase()} · Área {t.area} · {t.node_count} nós · {t.edge_count} links
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs font-mono text-muted flex items-center gap-1">
                  <Clock size={10} /> {new Date(t.created_at).toLocaleString('pt-BR')}
                </span>
                <button onClick={e => { e.stopPropagation(); navigate(`/topology/${t.id}`) }}
                  className="p-2 border border-border text-muted hover:border-accent hover:text-accent transition-all">
                  <Eye size={13} />
                </button>
                <button onClick={e => handleDelete(t.id, e)}
                  className="p-2 border border-border text-muted hover:border-red-500 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
