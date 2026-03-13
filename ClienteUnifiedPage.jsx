import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import { physicalApi, topologyApi } from '../utils/api'
import {
  ArrowLeft, Server, Cpu, Network, Plus, Trash2, Upload,
  CheckCircle, Play, RefreshCw, Wifi, List, Settings,
  Terminal, ChevronDown, ChevronRight, Zap, AlertTriangle, Eye, EyeOff, Pencil
} from 'lucide-react'
import PhysicalGraph from '../components/PhysicalGraph'
import TopologyGraph from '../components/TopologyGraph'
import toast from 'react-hot-toast'

// ── Status badge ────────────────────────────────────────────
function StatusDot({ status, label }) {
  const colors = {
    ok:       'bg-green-500',
    error:    'bg-red-500',
    scanning: 'bg-yellow-400 animate-pulse',
    null:     'bg-gray-600',
    undefined:'bg-gray-600',
  }
  return (
    <span className="flex items-center gap-1">
      <span className={`w-2 h-2 rounded-full shrink-0 ${colors[status] || 'bg-gray-600'}`} />
      {label && <span className="text-xs font-mono text-muted">{label}</span>}
    </span>
  )
}

// ── Log modal ───────────────────────────────────────────────
function LogModal({ title, log, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="bg-surface border border-border w-[600px] max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <span className="text-xs font-mono text-accent">{title}</span>
          <button onClick={onClose} className="text-muted hover:text-white text-lg leading-none">×</button>
        </div>
        <pre className="flex-1 overflow-auto p-4 text-xs font-mono text-white/80 whitespace-pre-wrap leading-relaxed">
          {log || '(sem log)'}
        </pre>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Painel: Equipamentos
// ─────────────────────────────────────────────
function DevicesPanel({ groupName }) {
  const [devices, setDevices]               = useState([])
  const [loading, setLoading]               = useState(true)
  const [mode, setMode]                     = useState(null) // null | 'add' | 'bulk' | 'wiki' | 'settings'
  const [logModal, setLogModal]             = useState(null) // {title, log}
  const [scanningIds, setScanningIds]       = useState(new Set())
  const [expandedId, setExpandedId]         = useState(null)
  const [editingId, setEditingId]           = useState(null)

  // Add single
  const [ip, setIp]             = useState('')
  const [community, setCommunity] = useState('')
  const [sshPort, setSshPort]   = useState('22')
  const [sshUser, setSshUser]   = useState('')
  const [sshPass, setSshPass]   = useState('')
  const [showPass, setShowPass] = useState(false)

  // Wiki import
  const [wikiText, setWikiText]           = useState('')
  const [wikiPreview, setWikiPreview]     = useState(null)
  const [wikiImporting, setWikiImporting] = useState(false)

  // Bulk
  const [bulkText, setBulkText] = useState('')

  // Settings
  const [defaultCommunity, setDefaultCommunity] = useState(
    () => localStorage.getItem(`community_${groupName}`) || 'public'
  )
  const [editComm, setEditComm] = useState(defaultCommunity)

  const load = useCallback(async () => {
    const r = await physicalApi.listDevices()
    setDevices(r.data.filter(d => d.group_name === groupName))
    setLoading(false)
  }, [groupName])

  useEffect(() => { load() }, [load])

  const saveDefaultCommunity = () => {
    localStorage.setItem(`community_${groupName}`, editComm)
    setDefaultCommunity(editComm)
    setMode(null)
    toast.success(`Community padrão: "${editComm}"`)
  }

  const addSingle = async () => {
    if (!ip.trim()) return
    try {
      await physicalApi.addDevice({
        ip: ip.trim(),
        community: community.trim() || defaultCommunity,
        snmp_ver: '2c',
        group_name: groupName,
        ssh_port: parseInt(sshPort) || 22,
        ssh_user: sshUser.trim() || null,
        ssh_password: sshPass || null,
      })
      setIp(''); setCommunity(''); setSshUser(''); setSshPass(''); setSshPort('22')
      toast.success(`${ip} adicionado`); load()
    } catch(e) { toast.error(e.response?.data?.detail || 'Erro') }
  }

  const bulkImport = async () => {
    const lines = bulkText.trim().split('\n').map(l => l.trim()).filter(Boolean)
    const list = lines.map(l => {
      const [ipPart, commPart] = l.split(/[\s,;]+/)
      return { ip: ipPart, community: commPart || defaultCommunity, snmp_ver: '2c', group_name: groupName }
    })
    try {
      const r = await physicalApi.addDevicesBulk(list)
      toast.success(`${r.data.added?.length || 0} adicionados`)
      setBulkText(''); setMode(null); load()
    } catch { toast.error('Erro na importação') }
  }

  const wikiPreviewFn = async () => {
    if (!wikiText.trim()) return
    setWikiImporting(true)
    try {
      // Show preview first by parsing client-side equivalent
      const r = await physicalApi.wikiImport({
        text: wikiText, group_name: groupName, default_community: defaultCommunity
      })
      toast.success(`${r.data.added?.length || 0} adicionados · ${r.data.skipped?.length || 0} já existiam`)
      setWikiText(''); setWikiPreview(null); setMode(null); load()
    } catch(e) { toast.error(e.response?.data?.detail || 'Erro ao importar') }
    finally { setWikiImporting(false) }
  }

  const testDevice = async (id) => {
    try {
      await physicalApi.testDevice(id); load()
    } catch { load() }
  }

  const testAll = async () => {
    toast('Testando todos...', { icon: '🔄' })
    await Promise.allSettled(devices.map(d => physicalApi.testDevice(d.id)))
    load(); toast.success('Testes concluídos')
  }

  const scanDevice = async (id) => {
    setScanningIds(s => new Set(s).add(id))
    try {
      await physicalApi.scanDevice(id)
      // Poll for completion
      const poll = setInterval(async () => {
        try {
          const r = await physicalApi.scanStatus(id)
          if (r.data.ssh_status !== 'scanning') {
            clearInterval(poll)
            setScanningIds(s => { const n = new Set(s); n.delete(id); return n })
            load()
            if (r.data.ssh_status === 'ok') toast.success('Varredura concluída!')
            else toast.error('Varredura falhou — veja o log')
          }
        } catch { clearInterval(poll); setScanningIds(s => { const n = new Set(s); n.delete(id); return n }) }
      }, 2000)
    } catch(e) {
      setScanningIds(s => { const n = new Set(s); n.delete(id); return n })
      toast.error(e.response?.data?.detail || 'Erro ao iniciar varredura')
    }
  }

  const remove = async (id) => {
    await physicalApi.deleteDevice(id); load()
  }

  const setModeToggle = (m) => setMode(prev => prev === m ? null : m)

  const VENDOR_COLORS = {
    huawei:   { border: 'border-red-700/60 text-red-400' },
    datacom:  { border: 'border-orange-700/60 text-orange-400' },
    cisco:    { border: 'border-blue-700/60 text-blue-400' },
    juniper:  { border: 'border-green-700/60 text-green-400' },
    arista:   { border: 'border-purple-700/60 text-purple-400' },
    nokia:    { border: 'border-cyan-700/60 text-cyan-400' },
    edgecore: { border: 'border-pink-700/60 text-pink-400' },
  }

  return (
    <div className="flex flex-col h-full overflow-auto p-6">
      {logModal && <LogModal title={logModal.title} log={logModal.log} onClose={() => setLogModal(null)} />}

      <div className="max-w-3xl mx-auto w-full space-y-4">

        {/* Header */}
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-sm font-mono text-accent uppercase tracking-wider flex-1">// Equipamentos</h2>
          <button onClick={() => setModeToggle('settings')}
            className={`p-1.5 border text-xs transition-all ${mode==='settings' ? 'border-accent text-accent' : 'border-border text-muted hover:text-white'}`}
            title="Community padrão SNMP">
            <Settings size={13} />
          </button>
          <button onClick={() => setModeToggle('add')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border transition-all ${mode==='add' ? 'border-accent text-accent bg-accent/10' : 'border-border text-muted hover:border-accent hover:text-accent'}`}>
            <Plus size={12} /> Adicionar
          </button>
          <button onClick={() => setModeToggle('wiki')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border transition-all ${mode==='wiki' ? 'border-accent text-accent bg-accent/10' : 'border-border text-muted hover:border-accent hover:text-accent'}`}>
            <Upload size={12} /> Wiki
          </button>
          <button onClick={() => setModeToggle('bulk')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border transition-all ${mode==='bulk' ? 'border-accent text-accent bg-accent/10' : 'border-border text-muted hover:border-accent hover:text-accent'}`}>
            <List size={12} /> Em massa
          </button>
          {devices.length > 0 && (
            <button onClick={testAll}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-border text-muted hover:border-accent hover:text-accent transition-all">
              <RefreshCw size={12} /> Testar todos
            </button>
          )}
        </div>

        {/* Settings */}
        {mode === 'settings' && (
          <div className="flex items-center gap-2 p-3 border border-border bg-card">
            <span className="text-xs font-mono text-muted shrink-0">Community SNMP padrão:</span>
            <input value={editComm} onChange={e => setEditComm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveDefaultCommunity()}
              className="flex-1 bg-surface border border-border px-3 py-1.5 text-sm font-mono text-white focus:border-accent focus:outline-none" />
            <button onClick={saveDefaultCommunity}
              className="px-3 py-1.5 bg-accent text-bg font-mono text-xs font-bold">Salvar</button>
          </div>
        )}

        {/* Add single */}
        {mode === 'add' && (
          <div className="p-3 border border-accent/40 bg-accent/5 space-y-2">
            <div className="flex gap-2">
              <input autoFocus value={ip} onChange={e => setIp(e.target.value)}
                placeholder="IP" onKeyDown={e => e.key === 'Enter' && addSingle()}
                className="flex-1 bg-surface border border-border px-3 py-2 text-sm font-mono text-white focus:border-accent focus:outline-none" />
              <input value={community} onChange={e => setCommunity(e.target.value)}
                placeholder={`community (${defaultCommunity})`}
                className="w-40 bg-surface border border-border px-3 py-2 text-sm font-mono text-white focus:border-accent focus:outline-none" />
            </div>
            <div className="flex gap-2">
              <input value={sshUser} onChange={e => setSshUser(e.target.value)}
                placeholder="user SSH" onKeyDown={e => e.key === 'Enter' && addSingle()}
                className="flex-1 bg-surface border border-border px-3 py-2 text-sm font-mono text-white focus:border-accent focus:outline-none" />
              <div className="relative flex-1">
                <input type={showPass ? 'text' : 'password'} value={sshPass} onChange={e => setSshPass(e.target.value)}
                  placeholder="senha SSH" onKeyDown={e => e.key === 'Enter' && addSingle()}
                  className="w-full bg-surface border border-border px-3 py-2 pr-8 text-sm font-mono text-white focus:border-accent focus:outline-none" />
                <button onClick={() => setShowPass(v => !v)} className="absolute right-2 top-2.5 text-muted hover:text-white">
                  {showPass ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
              </div>
              <input value={sshPort} onChange={e => setSshPort(e.target.value)}
                placeholder="porta" className="w-16 bg-surface border border-border px-3 py-2 text-sm font-mono text-white focus:border-accent focus:outline-none" />
              <button onClick={addSingle}
                className="px-4 py-2 bg-accent text-bg font-mono text-sm font-bold hover:bg-accent/90">OK</button>
            </div>
          </div>
        )}

        {/* Wiki import */}
        {mode === 'wiki' && (
          <div className="p-3 border border-accent/40 bg-accent/5 space-y-2">
            <p className="text-xs font-mono text-muted">Cole o conteúdo da wiki — formato:</p>
            <pre className="text-xs font-mono text-accent/70 bg-black/20 p-2">{`S6730 (SP4)\n* 100.100.115.243\n* Porta: 5612\n* User: openx\n* Senha: fg766yu8uik9i`}</pre>
            <textarea value={wikiText} onChange={e => setWikiText(e.target.value)}
              rows={8} placeholder="Cole aqui os equipamentos da wiki..."
              className="w-full bg-surface border border-border px-3 py-2 text-sm font-mono text-white focus:border-accent focus:outline-none resize-none" />
            <div className="flex gap-2">
              <button onClick={wikiPreviewFn} disabled={wikiImporting || !wikiText.trim()}
                className="px-4 py-1.5 bg-accent text-bg font-mono text-xs font-bold disabled:opacity-40">
                {wikiImporting ? '// importando...' : 'Importar'}
              </button>
              <button onClick={() => { setMode(null); setWikiText('') }}
                className="px-3 py-1.5 border border-border text-muted font-mono text-xs hover:text-white">Cancelar</button>
            </div>
          </div>
        )}

        {/* Bulk */}
        {mode === 'bulk' && (
          <div className="p-3 border border-accent/40 bg-accent/5 space-y-2">
            <p className="text-xs font-mono text-muted">Um IP por linha: <span className="text-accent">192.168.1.1</span> ou <span className="text-accent">192.168.1.1 community</span></p>
            <textarea value={bulkText} onChange={e => setBulkText(e.target.value)}
              rows={6} placeholder={"192.168.1.1\n192.168.1.2 minhacommunity"}
              className="w-full bg-surface border border-border px-3 py-2 text-sm font-mono text-white focus:border-accent focus:outline-none resize-none" />
            <div className="flex gap-2">
              <button onClick={bulkImport} disabled={!bulkText.trim()}
                className="px-4 py-1.5 bg-accent text-bg font-mono text-xs font-bold disabled:opacity-40">Importar</button>
              <button onClick={() => { setMode(null); setBulkText('') }}
                className="px-3 py-1.5 border border-border text-muted font-mono text-xs hover:text-white">Cancelar</button>
            </div>
          </div>
        )}

        {/* Device list */}
        {loading ? (
          <p className="text-xs font-mono text-muted animate-pulse py-8 text-center">// carregando...</p>
        ) : devices.length === 0 ? (
          <div className="border border-dashed border-border p-12 text-center">
            <Server size={32} className="text-muted mx-auto mb-3" />
            <p className="text-muted font-mono text-sm">Nenhum equipamento cadastrado.</p>
            <p className="text-muted/50 font-mono text-xs mt-1">Use "Wiki" para importar da wiki ou "Adicionar" para cadastrar manualmente.</p>
          </div>
        ) : (
          <div className="space-y-px">
            {devices.map(d => {
              const scanning   = scanningIds.has(d.id)
              const isExpanded = expandedId === d.id
              const isEditing  = editingId === d.id
              const hasSSH     = d.ssh_user && d.ssh_password
              const scanResult = d.meta?.scan_result
              const displayName = d.wiki_name || d.hostname || d.ip
              return (
                <div key={d.id} className={`border bg-card transition-all ${isExpanded ? 'border-accent/40' : 'border-border hover:border-accent/30'}`}>
                  {/* Main row */}
                  <div className="flex items-center gap-2 px-3 py-2.5 group">
                    <button onClick={() => { setExpandedId(isExpanded ? null : d.id); setEditingId(null) }}
                      className="text-muted hover:text-white transition-all shrink-0">
                      {isExpanded ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}
                    </button>

                    {/* Status dots with tooltips */}
                    <span title={`SNMP: ${d.snmp_status === 'ok' ? 'OK' : d.snmp_status === 'error' ? 'Erro' : 'Não testado'}`}>
                      <StatusDot status={d.snmp_status} />
                    </span>
                    {hasSSH
                      ? <span title={`SSH: ${scanning ? 'Varrendo...' : d.ssh_status === 'ok' ? 'OK' : d.ssh_status === 'error' ? 'Erro' : 'Não testado'}`}>
                          <StatusDot status={scanning ? 'scanning' : d.ssh_status} />
                        </span>
                      : <span className="w-3 shrink-0"/>}

                    {/* Name — vivid colors */}
                    <div className="flex-1 min-w-0">
                      <span className="font-mono text-sm font-semibold text-white">
                        {displayName}
                      </span>
                      {d.snmp_sysname && d.snmp_sysname !== displayName && (
                        <span className="font-mono text-xs text-blue-400/70 ml-2">↳ {d.snmp_sysname}</span>
                      )}
                    </div>

                    {/* IP — vivid */}
                    <span className="font-mono text-xs text-emerald-400 shrink-0">{d.ip}</span>

                    {/* Vendor badge */}
                    {d.vendor && (
                      <span className={`font-mono text-xs shrink-0 px-1.5 py-0.5 border ${VENDOR_COLORS[d.vendor]?.border || 'border-muted/30 text-muted'}`}>
                        {d.vendor}
                      </span>
                    )}

                    {/* Actions — visible on hover, with labels */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button onClick={() => testDevice(d.id)}
                        className="flex items-center gap-1 px-2 py-1 text-xs font-mono border border-border text-muted hover:border-accent hover:text-accent transition-all"
                        title="Testar conectividade SNMP e SSH">
                        <Wifi size={11} /> Testar
                      </button>
                      {hasSSH && (
                        <button onClick={() => scanDevice(d.id)} disabled={scanning}
                          className="flex items-center gap-1 px-2 py-1 text-xs font-mono border border-border text-muted hover:border-yellow-500 hover:text-yellow-400 transition-all disabled:opacity-40"
                          title="Varredura SSH: configurar SNMP no equipamento">
                          <Zap size={11} /> {scanning ? 'Varrendo...' : 'Varredura'}
                        </button>
                      )}
                      <button onClick={() => { setEditingId(isEditing ? null : d.id); setExpandedId(d.id) }}
                        className={`flex items-center gap-1 px-2 py-1 text-xs font-mono border transition-all
                          ${isEditing ? 'border-accent text-accent' : 'border-border text-muted hover:border-accent hover:text-accent'}`}>
                        <Pencil size={11} /> Editar
                      </button>
                      <button onClick={() => remove(d.id)}
                        className="flex items-center gap-1 px-2 py-1 text-xs font-mono border border-border text-muted hover:border-red-500 hover:text-red-400 transition-all">
                        <Trash2 size={11} /> Remover
                      </button>
                    </div>
                  </div>

                  {/* Expanded: details + edit */}
                  {isExpanded && (
                    <div className="px-4 pb-3 pt-1 border-t border-border/40 space-y-3">

                      {isEditing
                        ? <EditDeviceForm device={d} onSave={async (updates) => {
                            await physicalApi.updateDevice(d.id, updates)
                            setEditingId(null); toast.success('Salvo'); load()
                          }} onCancel={() => setEditingId(null)} />
                        : (
                          <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-1">
                            <div className="text-xs font-mono">
                              <span className="text-muted">IP: </span>
                              <span className="text-emerald-400">{d.ip}</span>
                            </div>
                            <div className="text-xs font-mono">
                              <span className="text-muted">Community: </span>
                              <span className="text-cyan-300">{d.community}</span>
                            </div>
                            {hasSSH && <>
                              <div className="text-xs font-mono">
                                <span className="text-muted">SSH user: </span>
                                <span className="text-white">{d.ssh_user}</span>
                              </div>
                              <div className="text-xs font-mono">
                                <span className="text-muted">SSH porta: </span>
                                <span className="text-white">{d.ssh_port || 22}</span>
                              </div>
                            </>}
                            {d.sys_descr && (
                              <div className="col-span-2 text-xs font-mono text-muted/60 truncate mt-1">
                                {d.sys_descr.slice(0, 140)}
                              </div>
                            )}
                          </div>
                        )
                      }

                      {/* Log buttons */}
                      {!isEditing && (
                        <div className="flex gap-2 flex-wrap">
                          {d.snmp_log && (
                            <button onClick={() => setLogModal({ title: `SNMP — ${d.ip}`, log: d.snmp_log })}
                              className={`flex items-center gap-1.5 px-2 py-1 text-xs font-mono border transition-all
                                ${d.snmp_status === 'ok' ? 'border-green-700 text-green-400' : 'border-red-700 text-red-400'}`}>
                              <Terminal size={10} /> Log SNMP
                            </button>
                          )}
                          {d.ssh_log && (
                            <button onClick={() => setLogModal({ title: `SSH — ${d.ip}`, log: d.ssh_log })}
                              className={`flex items-center gap-1.5 px-2 py-1 text-xs font-mono border transition-all
                                ${d.ssh_status === 'ok' ? 'border-green-700 text-green-400' : 'border-red-700 text-red-400'}`}>
                              <Terminal size={10} /> Log SSH
                            </button>
                          )}
                          {scanResult && (
                            <button onClick={() => setLogModal({ title: `Varredura — ${d.ip}`, log:
                              (scanResult.changes_made
                                ? `✓ Alterações feitas:\n${scanResult.changes.join('\n')}\n\n`
                                : '✓ Sem alterações necessárias\n\n')
                              + `Config SNMP após:\n${scanResult.snmp_config_after}`
                            })}
                              className="flex items-center gap-1.5 px-2 py-1 text-xs font-mono border border-yellow-700 text-yellow-400">
                              <Zap size={10} /> Resultado varredura
                              {scanResult.changes_made && <span className="bg-yellow-500 text-black text-xs px-1 font-bold ml-1">!</span>}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Edição inline de equipamento
// ─────────────────────────────────────────────
function EditDeviceForm({ device: d, onSave, onCancel }) {
  const [community, setCommunity] = useState(d.community || '')
  const [sshUser, setSshUser]     = useState(d.ssh_user || '')
  const [sshPass, setSshPass]     = useState(d.ssh_password || '')
  const [sshPort, setSshPort]     = useState(String(d.ssh_port || 22))
  const [wikiName, setWikiName]   = useState(d.wiki_name || d.hostname || '')
  const [showPass, setShowPass]   = useState(false)
  const [saving, setSaving]       = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await onSave({
        community: community.trim() || d.community,
        ssh_user: sshUser.trim() || null,
        ssh_password: sshPass || null,
        ssh_port: parseInt(sshPort) || 22,
        wiki_name: wikiName.trim() || null,
      })
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-2 py-1">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs font-mono text-muted">Nome (wiki)</label>
          <input value={wikiName} onChange={e => setWikiName(e.target.value)}
            className="w-full bg-surface border border-border px-2 py-1.5 text-xs font-mono text-white focus:border-accent focus:outline-none" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-mono text-muted">Community SNMP</label>
          <input value={community} onChange={e => setCommunity(e.target.value)}
            className="w-full bg-surface border border-border px-2 py-1.5 text-xs font-mono text-white focus:border-accent focus:outline-none" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-mono text-muted">SSH user</label>
          <input value={sshUser} onChange={e => setSshUser(e.target.value)}
            className="w-full bg-surface border border-border px-2 py-1.5 text-xs font-mono text-white focus:border-accent focus:outline-none" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-mono text-muted">Porta SSH</label>
          <input value={sshPort} onChange={e => setSshPort(e.target.value)}
            className="w-full bg-surface border border-border px-2 py-1.5 text-xs font-mono text-white focus:border-accent focus:outline-none" />
        </div>
        <div className="col-span-2 space-y-1">
          <label className="text-xs font-mono text-muted">Senha SSH</label>
          <div className="relative">
            <input type={showPass ? 'text' : 'password'} value={sshPass} onChange={e => setSshPass(e.target.value)}
              placeholder="deixe em branco para não alterar"
              className="w-full bg-surface border border-border px-2 py-1.5 pr-8 text-xs font-mono text-white focus:border-accent focus:outline-none" />
            <button onClick={() => setShowPass(v => !v)} className="absolute right-2 top-2 text-muted hover:text-white">
              {showPass ? <EyeOff size={11}/> : <Eye size={11}/>}
            </button>
          </div>
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={save} disabled={saving}
          className="px-3 py-1.5 bg-accent text-bg font-mono text-xs font-bold disabled:opacity-50">
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
        <button onClick={onCancel}
          className="px-3 py-1.5 border border-border text-muted font-mono text-xs hover:text-white">
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Painel: Topologia Física
// ─────────────────────────────────────────────
function PhysicalPanel({ groupName }) {
  const [topos, setTopos]             = useState([])
  const [activeTopo, setActiveTopo]   = useState(null)
  const [crawling, setCrawling]       = useState(false)
  const [showPorts, setShowPorts]     = useState(true)
  const [showHistory, setShowHistory] = useState(false)
  const [selectedNode, setSelectedNode] = useState(null)
  const pollRef = useRef(null)

  const load = useCallback(async () => {
    const r = await physicalApi.listTopologies()
    const g = r.data.filter(t => t.group_name === groupName)
    setTopos(g)
    setActiveTopo(prev => g.find(t => t.id === prev?.id) || g[0] || null)
  }, [groupName])

  useEffect(() => { load(); return () => clearInterval(pollRef.current) }, [load])

  const startCrawl = async () => {
    setCrawling(true)
    try {
      const r = await physicalApi.startCrawl({ group_name: groupName })
      const topoId = r.data.topology_id   // backend returns topology_id, not crawl_id
      if (!topoId) { setCrawling(false); toast.error('Resposta inválida do servidor'); return }
      pollRef.current = setInterval(async () => {
        try {
          const s = await physicalApi.crawlStatus(topoId)
          if (s.data.status === 'done') {
            clearInterval(pollRef.current); setCrawling(false)
            const m = s.data.meta || {}
            toast.success(`Crawl concluído! ${m.nodes_discovered || 0} nós · ${m.links_discovered || 0} links`)
            load()
          } else if (s.data.status === 'error') {
            clearInterval(pollRef.current); setCrawling(false)
            toast.error(`Crawl falhou: ${s.data.error_msg || 'erro desconhecido'}`)
          }
        } catch { clearInterval(pollRef.current); setCrawling(false) }
      }, 2500)
    } catch(e) {
      setCrawling(false)
      toast.error(e?.response?.data?.detail || 'Erro ao iniciar crawl')
    }
  }

  const deleteTopo = async (id, e) => {
    e.stopPropagation()
    if (!confirm('Remover topologia?')) return
    await physicalApi.deleteTopology(id)
    setTopos(p => { const n = p.filter(t => t.id !== id); return n })
    if (activeTopo?.id === id) setActiveTopo(null)
    toast.success('Removida')
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sub-toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-surface shrink-0 flex-wrap">
        <button onClick={startCrawl} disabled={crawling}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono border border-border text-muted hover:border-accent hover:text-accent disabled:opacity-50 transition-all">
          <Play size={12} /> {crawling ? '// crawling...' : 'Crawl LLDP'}
        </button>

        {topos.length > 0 && (
          <>
            <span className="text-border text-xs">|</span>
            {/* Histórico dropdown */}
            <div className="relative">
              <button onClick={() => setShowHistory(v => !v)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono border transition-all
                  ${showHistory ? 'border-accent text-accent bg-accent/10' : 'border-border text-muted hover:border-accent hover:text-accent'}`}>
                <List size={12} /> Histórico ({topos.length})
              </button>
              {showHistory && (
                <div className="absolute top-full left-0 mt-1 w-64 bg-surface border border-border z-50 shadow-xl">
                  {topos.map(t => (
                    <div key={t.id}
                      onClick={() => { setActiveTopo(t); setShowHistory(false) }}
                      className={`group flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-white/5 transition-all
                        ${activeTopo?.id === t.id ? 'bg-accent/10 border-l-2 border-accent' : 'border-l-2 border-transparent'}`}>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-mono truncate ${activeTopo?.id === t.id ? 'text-accent' : 'text-white'}`}>
                          {new Date(t.crawled_at).toLocaleString('pt-BR')}
                        </p>
                        <p className="text-xs font-mono text-muted">
                          {t.meta?.nodes_discovered || 0} nós · {t.meta?.links_discovered || 0} links
                        </p>
                      </div>
                      <button onClick={e => deleteTopo(t.id, e)}
                        className="p-1 text-muted hover:text-red-400 transition-all opacity-0 group-hover:opacity-100 shrink-0">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {activeTopo && (
              <span className="text-xs font-mono text-white border border-accent/30 px-2 py-1 bg-accent/5">
                {new Date(activeTopo.crawled_at).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
              </span>
            )}
          </>
        )}

        {activeTopo && (
          <>
            <span className="text-border text-xs">|</span>
            <button onClick={() => setShowPorts(v => !v)}
              className={`px-2.5 py-1.5 text-xs font-mono border transition-all
                ${showPorts ? 'border-accent text-accent bg-accent/10' : 'border-border text-muted hover:border-accent hover:text-accent'}`}>
              Portas
            </button>
          </>
        )}

        <div className="flex-1" />
        {activeTopo && (
          <span className="text-xs font-mono text-muted">
            {activeTopo.meta?.nodes_discovered || 0} nós · {activeTopo.meta?.links_discovered || 0} links
          </span>
        )}
      </div>

      {/* Fechar histórico ao clicar fora */}
      {showHistory && <div className="fixed inset-0 z-40" onClick={() => setShowHistory(false)} />}

      {/* Graph */}
      <div className="flex-1 overflow-hidden">
        {!activeTopo ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Cpu size={40} className="text-muted" />
            <p className="text-muted font-mono text-sm">Nenhuma topologia física gerada.</p>
            <button onClick={startCrawl} disabled={crawling}
              className="flex items-center gap-2 px-4 py-2 border border-accent text-accent font-mono text-sm hover:bg-accent/10 transition-all">
              <Play size={13} /> {crawling ? '// crawling...' : 'Iniciar Crawl LLDP'}
            </button>
          </div>
        ) : (
          <PhysicalGraph topologyId={activeTopo.id} showPortLabels={showPorts} onNodeSelect={setSelectedNode} />
        )}
      </div>

      {selectedNode && (
        <div className="shrink-0 border-t border-border bg-surface px-4 py-2 flex items-center gap-4">
          <span className="font-mono text-sm text-white">{selectedNode.label}</span>
          {selectedNode.ip && <span className="font-mono text-xs text-muted">{selectedNode.ip}</span>}
          {selectedNode.type === 'neighbor' && (
            <span className="text-xs font-mono text-yellow-500 border border-yellow-700/50 px-2 py-0.5">⚠ Não cadastrado</span>
          )}
          <button onClick={() => setSelectedNode(null)} className="ml-auto text-muted hover:text-white text-lg leading-none">×</button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// Painel: Topologia OSPF
// ─────────────────────────────────────────────
function OspfPanel({ groupName }) {
  const [topos, setTopos]             = useState([])
  const [activeTopo, setActiveTopo]   = useState(null)
  const [showUpload, setShowUpload]   = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const load = useCallback(async () => {
    const r = await topologyApi.list()
    const g = r.data.filter(t => t.client_group === groupName)
    setTopos(g)
    setActiveTopo(prev => g.find(t => t.id === prev?.id) || g[0] || null)
  }, [groupName])

  useEffect(() => { load() }, [load])

  const deleteTopo = async (id, e) => {
    e.stopPropagation()
    if (!confirm('Remover topologia?')) return
    await topologyApi.delete(id)
    setTopos(p => p.filter(t => t.id !== id))
    if (activeTopo?.id === id) setActiveTopo(null)
    toast.success('Removida')
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sub-toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-surface shrink-0 flex-wrap">
        <button onClick={() => { setShowUpload(v => !v); setShowHistory(false) }}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono border transition-all
            ${showUpload ? 'border-accent text-accent bg-accent/10' : 'border-border text-muted hover:border-accent hover:text-accent'}`}>
          <Upload size={12} /> Importar LSDB
        </button>

        {topos.length > 0 && (
          <>
            <span className="text-border text-xs">|</span>
            <div className="relative">
              <button onClick={() => { setShowHistory(v => !v); setShowUpload(false) }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono border transition-all
                  ${showHistory ? 'border-accent text-accent bg-accent/10' : 'border-border text-muted hover:border-accent hover:text-accent'}`}>
                <List size={12} /> Histórico ({topos.length})
              </button>
              {showHistory && (
                <div className="absolute top-full left-0 mt-1 w-64 bg-surface border border-border z-50 shadow-xl">
                  {topos.map(t => (
                    <div key={t.id}
                      onClick={() => { setActiveTopo(t); setShowHistory(false) }}
                      className={`group flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-white/5 transition-all
                        ${activeTopo?.id === t.id ? 'bg-accent/10 border-l-2 border-accent' : 'border-l-2 border-transparent'}`}>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-mono truncate ${activeTopo?.id === t.id ? 'text-accent' : 'text-white'}`}>{t.name}</p>
                        <p className="text-xs font-mono text-muted">{t.node_count} nós · {t.edge_count} links</p>
                      </div>
                      <button onClick={e => deleteTopo(t.id, e)}
                        className="p-1 text-muted hover:text-red-400 transition-all opacity-0 group-hover:opacity-100 shrink-0">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {activeTopo && !showUpload && (
              <span className="text-xs font-mono text-white border border-accent/30 px-2 py-1 bg-accent/5">
                {activeTopo.name}
              </span>
            )}
          </>
        )}

        {activeTopo && !showUpload && (
          <span className="ml-auto text-xs font-mono text-muted">
            {activeTopo.node_count} nós · {activeTopo.edge_count} links
          </span>
        )}
      </div>

      {showHistory && <div className="fixed inset-0 z-40" onClick={() => setShowHistory(false)} />}

      {showUpload && (
        <div className="shrink-0 border-b border-border bg-card">
          <OspfUploadInline groupName={groupName} onDone={(t) => { setShowUpload(false); load(); if (t) setActiveTopo(t) }} />
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        {!activeTopo && !showUpload ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Network size={40} className="text-muted" />
            <p className="text-muted font-mono text-sm">Nenhuma topologia OSPF importada.</p>
            <button onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 px-4 py-2 border border-accent text-accent font-mono text-sm hover:bg-accent/10 transition-all">
              <Upload size={13} /> Importar LSDB
            </button>
          </div>
        ) : activeTopo && !showUpload ? (
          <TopologyGraph topologyId={activeTopo.id} />
        ) : null}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Upload OSPF inline
// ─────────────────────────────────────────────
function OspfUploadInline({ groupName, onDone }) {
  const [file, setFile]       = useState(null)
  const [name, setName]       = useState('')
  const [area, setArea]       = useState('0.0.0.0')
  const [loading, setLoading] = useState(false)

  const onDrop = useCallback(([f]) => {
    if (!f) return; setFile(f)
    if (!name) setName(f.name.replace(/\.(txt|log)$/i, ''))
  }, [name])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'text/plain': ['.txt', '.log', '.text'], 'application/octet-stream': [] }, multiple: false,
  })

  const submit = async () => {
    if (!file || !name.trim()) return toast.error('Arquivo e nome obrigatórios')
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('file', file); fd.append('name', name)
      fd.append('protocol', 'ospf'); fd.append('area', area)
      fd.append('client_group', groupName)
      const r = await topologyApi.upload(fd)
      toast.success(`${r.data.graph_data?.stats?.node_count || 0} roteadores encontrados!`)
      onDone(r.data)
    } catch(e) { toast.error(e.response?.data?.detail || 'Erro no upload') }
    finally { setLoading(false) }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 flex-wrap">
      <div {...getRootProps()} className={`flex items-center gap-2 px-3 py-2 border cursor-pointer transition-all text-xs font-mono
        ${isDragActive ? 'border-accent text-accent bg-accent/5' : 'border-dashed border-border text-muted hover:border-accent hover:text-accent'}`}>
        <input {...getInputProps()} />
        {file
          ? <><CheckCircle size={12} className="text-accent" />{file.name}</>
          : <><Upload size={12} />Selecionar arquivo</>}
      </div>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome da topologia"
        className="flex-1 min-w-32 bg-surface border border-border px-3 py-2 text-xs font-mono text-white focus:border-accent focus:outline-none" />
      <input value={area} onChange={e => setArea(e.target.value)} placeholder="Área OSPF"
        className="w-24 bg-surface border border-border px-3 py-2 text-xs font-mono text-white focus:border-accent focus:outline-none" />
      <button onClick={submit} disabled={loading || !file}
        className="px-4 py-2 bg-accent text-bg font-mono text-xs font-bold hover:bg-accent/90 disabled:opacity-40 transition-all">
        {loading ? '// processando...' : 'Importar'}
      </button>
      <button onClick={() => onDone(null)} className="px-3 py-2 text-muted font-mono text-xs hover:text-white">✕</button>
    </div>
  )
}

// ─────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────
const TABS = [
  { id: 'devices',  label: 'Equipamentos',    icon: Server  },
  { id: 'physical', label: 'Topologia Física', icon: Cpu     },
  { id: 'ospf',     label: 'Topologia OSPF',   icon: Network },
]

export default function ClienteUnifiedPage() {
  const { clientName } = useParams()
  const decoded = decodeURIComponent(clientName)
  const [tab, setTab] = useState('devices')

  return (
    <div className="flex flex-col h-screen">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-surface shrink-0 flex-wrap">
        <Link to="/topology"
          className="flex items-center gap-1.5 text-xs font-mono text-muted hover:text-white transition-colors shrink-0">
          <ArrowLeft size={13} /> Voltar
        </Link>
        <span className="text-border">|</span>
        <span className="text-xs font-mono text-white font-bold shrink-0">{decoded}</span>
        <span className="text-border">|</span>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono border transition-all
              ${tab === id ? 'border-accent text-accent bg-accent/10' : 'border-transparent text-muted hover:text-white'}`}>
            <Icon size={12} /> {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === 'devices'  && <DevicesPanel  groupName={decoded} />}
        {tab === 'physical' && <PhysicalPanel groupName={decoded} />}
        {tab === 'ospf'     && <OspfPanel     groupName={decoded} />}
      </div>
    </div>
  )
}
