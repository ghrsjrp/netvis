import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { useNavigate } from 'react-router-dom'
import { topologyApi } from '../utils/api'
import toast from 'react-hot-toast'
import { Upload, FileText, CheckCircle } from 'lucide-react'

const VENDORS = [
  { name: 'Cisco IOS', cmd: 'show ip ospf database router\nshow ip ospf database network\nshow ip ospf database external' },
  { name: 'Cisco NX-OS', cmd: 'show ip ospf database router detail\nshow ip ospf database network detail' },
  { name: 'Juniper', cmd: 'show ospf database router extensive | no-more\nshow ospf database network extensive | no-more' },
  { name: 'FRR/Quagga', cmd: 'show ip ospf database router\nshow ip ospf database network' },
  { name: 'Nokia', cmd: 'show router ospf database type router detail\nshow router ospf database type network detail' },
  { name: 'Huawei', cmd: 'display ospf lsdb router\ndisplay ospf lsdb network' },
  { name: 'Fortinet', cmd: 'get router info ospf database router lsa\nget router info ospf database network lsa' },
  { name: 'Mikrotik', cmd: '/routing ospf lsa print detail file=lsa.txt' },
]

export default function UploadPage() {
  const [file, setFile] = useState(null)
  const [name, setName] = useState('')
  const [area, setArea] = useState('0.0.0.0')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const onDrop = useCallback(([f]) => {
    if (!f) return
    setFile(f)
    if (!name) setName(f.name.replace(/\.(txt|log)$/i, ''))
  }, [name])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/plain': ['.txt', '.log'] },
    multiple: false,
  })

  const handleSubmit = async () => {
    if (!file) return toast.error('Selecione um arquivo')
    if (!name.trim()) return toast.error('Dê um nome para a topologia')
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('name', name)
      fd.append('protocol', 'ospf')
      fd.append('area', area)
      const r = await topologyApi.upload(fd)
      toast.success(`${r.data.graph_data?.stats?.node_count || 0} roteadores encontrados!`)
      navigate(`/topology/${r.data.id}`)
    } catch (e) {
      const msg = e.response?.data?.detail || 'Erro no upload'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-8">
        <div className="text-xs font-mono text-accent mb-1">// IMPORTAR</div>
        <h1 className="text-2xl font-bold">Upload de LSDB</h1>
        <p className="text-muted text-sm mt-1">Faça upload do output do comando OSPF do seu roteador como arquivo .txt ou .log</p>
      </div>

      {/* Dropzone */}
      <div {...getRootProps()} className={`border-2 border-dashed p-12 text-center cursor-pointer transition-all mb-6
        ${isDragActive ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50'}`}>
        <input {...getInputProps()} />
        {file ? (
          <div className="flex flex-col items-center gap-2">
            <CheckCircle size={32} className="text-accent" />
            <p className="font-mono text-accent text-sm">{file.name}</p>
            <p className="text-muted text-xs">{(file.size / 1024).toFixed(1)} KB</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Upload size={32} className={isDragActive ? 'text-accent' : 'text-muted'} />
            <p className="font-mono text-sm text-white">
              {isDragActive ? 'Solte aqui...' : 'Arraste o arquivo ou clique para selecionar'}
            </p>
            <p className="text-muted text-xs">.txt ou .log</p>
          </div>
        )}
      </div>

      {/* Form */}
      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-xs font-mono text-muted mb-1">Nome da topologia *</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="ex: Rede Corporativa SP"
            className="w-full bg-card border border-border px-3 py-2 text-sm font-mono text-white placeholder-muted focus:border-accent focus:outline-none transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs font-mono text-muted mb-1">Área OSPF</label>
          <input
            value={area}
            onChange={e => setArea(e.target.value)}
            placeholder="0.0.0.0"
            className="w-full bg-card border border-border px-3 py-2 text-sm font-mono text-white placeholder-muted focus:border-accent focus:outline-none transition-colors"
          />
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={loading || !file}
        className="w-full py-3 bg-accent text-bg font-mono font-bold text-sm hover:bg-accent/90 transition-all disabled:opacity-40"
      >
        {loading ? '// processando...' : '// IMPORTAR TOPOLOGIA'}
      </button>

      {/* Commands reference */}
      <div className="mt-10">
        <p className="text-xs font-mono text-muted mb-4 border-b border-border pb-2">// COMANDOS POR VENDOR</p>
        <div className="grid gap-3">
          {VENDORS.map(v => (
            <div key={v.name} className="border border-border bg-card p-3">
              <p className="text-xs font-mono text-accent mb-2">{v.name}</p>
              <pre className="text-xs font-mono text-muted whitespace-pre-wrap">{v.cmd}</pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
