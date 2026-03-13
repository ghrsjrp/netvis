import { useState, useEffect, useRef } from 'react'
import { Network, Plus, Trash2, RefreshCw, Wifi,
         Play, Eye, EyeOff, Upload, Folder, FolderOpen, ChevronDown, ChevronRight } from 'lucide-react'
import { DataSet } from 'vis-data'
import { Network as VisNetwork } from 'vis-network'
import toast from 'react-hot-toast'
import { physicalApi } from '../utils/api'

const C = {
  bg:         '#1a2744',
  nodeBg:     '#1e3060',
  nodeBorder: '#1a56ff',
  nodeFont:   '#e8eaf0',
  edge:       '#2e4a7a',
  edgeLabel:  '#ffffff',
  neighbor:   '#f4c430',
}

// ── Physical Graph ─────────────────────────────────────────
function PhysicalGraph({ graphData }) {
  const containerRef = useRef(null)
  const networkRef   = useRef(null)
  const [showPorts, setShowPorts] = useState(true)

  useEffect(() => {
    if (!containerRef.current || !graphData?.nodes?.length) return

    const nodes = new DataSet(graphData.nodes.map(n => ({
      id:    n.id,
      label: n.label || n.id,
      title: `${n.label || n.id}\nIP: ${n.ip || n.id}\n${n.sys_descr ? n.sys_descr.slice(0, 80) : ''}`,
      shape: n.type === 'neighbor' ? 'diamond' : 'box',
      color: {
        background: n.type === 'neighbor' ? '#1a3300' : C.nodeBg,
        border:     n.type === 'neighbor' ? C.neighbor : C.nodeBorder,
        highlight:  { background: '#0a1a40', border: '#4d7fff' },
        hover:      { background: '#0d1833', border: '#1a56ff' },
      },
      font:        { color: C.nodeFont, size: 12, face: 'Space Mono' },
      borderWidth: 2,
      shadow:      { enabled: true, color: (n.type === 'neighbor' ? C.neighbor : C.nodeBorder) + '44', x: 0, y: 0, size: 8 },
    })))

    const edges = new DataSet(graphData.edges.map(e => ({
      id:    e.id,
      from:  e.from,
      to:    e.to,
      label: showPorts ? (e.label || '') : '',
      title: e.label || '',
      color: { color: C.edge, inherit: false },
      font:  { color: C.edgeLabel, size: 9, face: 'Space Mono', background: 'rgba(26,39,68,0.85)', strokeWidth: 0 },
      width: 2,
    })))

    if (networkRef.current) networkRef.current.destroy()
    networkRef.current = new VisNetwork(containerRef.current, { nodes, edges }, {
      physics: {
        solver: 'forceAtlas2Based',
        forceAtlas2Based: { gravitationalConstant: -80, springLength: 130, springConstant: 0.08, damping: 0.6 },
        stabilization: { iterations: 200 },
      },
      interaction: { hover: true, tooltipDelay: 150 },
    })
    return () => networkRef.current?.destroy()
  }, [graphData, showPorts])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-4 px-3 py-2 border-b border-border bg-surface shrink-0">
        <span className="flex items-center gap-1.5 text-xs font-mono text-muted">
          <span className="w-3 h-3 border-2 inline-block" style={{ borderColor: C.nodeBorder, background: C.nodeBg }} />
          Polled (SNMP)
        </span>
        <span className="flex items-center gap-1.5 text-xs font-mono text-muted">
          <span className="w-3 h-3 border-2 inline-block rotate-45" style={{ borderColor: C.neighbor, background: '#1a3300' }} />
          Descoberto (LLDP)
        </span>
        <button onClick={() => setShowPorts(v => !v)}
          className="ml-auto flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono border border-border text-muted hover:text-white transition-all">
          {showPorts ? <EyeOff size={12} /> : <Eye size={12} />}
          {showPorts ? 'Ocultar' : 'Mostrar'} portas
        </button>
      </div>
      <div ref={containerRef} className="flex-1" style={{ background: C.bg }} />
    </div>
  )
}

// ── Bulk Import Modal ──────────────────────────────────────
function BulkModal({ onClose, onImport }) {
  const [text, setText]         = useState('')
  const [community, setCommunity] = useState('public')
  const [snmpVer, setSnmpVer]   = useState('2c')

  const parsed = text.trim().split('\n').map(l => l.trim()).filter(Boolean).map(line => {
    const [ip, comm, ver] = line.split(/[\s,;]+/)
    return { ip: ip?.trim(), community: comm || community, snmp_ver: ver || snmpVer }
  }).filter(d => d.ip)

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-border w-full max-w-lg">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-mono font-bold text-sm text-white">Importar IPs em lote</h3>
          <button onClick={onClose} className="text-muted hover:text-white text-xl leading-none">×</button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs font-mono text-muted">
            Um IP por linha — opcionalmente: <code className="text-accent">ip community versão</code>
          </p>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={8}
            placeholder={"192.168.1.1\n192.168.1.2 public 2c\n10.0.0.1 private 1"}
            className="w-full bg-card border border-border font-mono text-sm text-white p-2 resize-none focus:outline-none focus:border-accent" />
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-mono text-muted block mb-1">Community padrão</label>
              <input value={community} onChange={e => setCommunity(e.target.value)}
                className="w-full bg-card border border-border font-mono text-sm text-white px-2 py-1 focus:outline-none focus:border-accent" />
            </div>
            <div className="w-24">
              <label className="text-xs font-mono text-muted block mb-1">Versão SNMP</label>
              <select value={snmpVer} onChange={e => setSnmpVer(e.target.value)}
                className="w-full bg-card border border-border font-mono text-sm text-white px-2 py-1 focus:outline-none focus:border-accent">
                <option value="2c">v2c</option>
                <option value="1">v1</option>
              </select>
            </div>
          </div>
          <p className="text-xs font-mono text-muted">{parsed.length} IPs detectados</p>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          <button onClick={onClose} className="px-3 py-1.5 border border-border text-muted font-mono text-sm hover:text-white">Cancelar</button>
          <button onClick={() => { onImport(parsed); onClose() }} disabled={!parsed.length}
            className="px-3 py-1.5 bg-accent text-bg font-mono text-sm font-bold hover:bg-accent/90 disabled:opacity-40">
            Importar {parsed.length} IPs
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────
// ── Groups Tab ─────────────────────────────────────────────
function GroupsTab({ groups, devices, onUpdate, onCrawl }) {
  const [newGroup, setNewGroup]       = useState('')
  const [expanded, setExpanded]       = useState({})
  const [movingDev, setMovingDev]     = useState(null)  // device id being moved

  const groupedDevices = {}
  const ungrouped = []
  for (const d of devices) {
    if (d.group_name) {
      if (!groupedDevices[d.group_name]) groupedDevices[d.group_name] = []
      groupedDevices[d.group_name].push(d)
    } else {
      ungrouped.push(d)
    }
  }

  // All group names (from devices + from groups list)
  const allGroups = [...new Set([
    ...groups.map(g => g.group).filter(Boolean),
    ...Object.keys(groupedDevices),
  ])]

  const toggleExpand = (g) => setExpanded(p => ({ ...p, [g]: !p[g] }))

  const assignGroup = async (deviceId, groupName) => {
    try {
      await physicalApi.updateDevice(deviceId, { group_name: groupName })
      await onUpdate()
      toast.success(groupName ? `Movido para ${groupName}` : 'Removido do grupo')
    } catch { toast.error('Erro ao mover') }
    setMovingDev(null)
  }

  const removeFromGroup = async (deviceId) => {
    await assignGroup(deviceId, '')
  }

  return (
    <div className="flex-1 overflow-auto p-4 space-y-4">
      {/* Create new group */}
      <div className="flex items-center gap-2">
        <input
          value={newGroup} onChange={e => setNewGroup(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && newGroup.trim()) {
            // Group is just a label — assign to first ungrouped or just show empty
            setExpanded(p => ({ ...p, [newGroup.trim()]: true }))
            setNewGroup('')
            toast.success(`Pasta "${newGroup.trim()}" criada — adicione devices abaixo`)
          }}}
          placeholder="Nome da pasta (ex: Conect BA)"
          className="w-64 bg-card border border-border font-mono text-sm text-white px-3 py-1.5 focus:outline-none focus:border-accent" />
        <button
          disabled={!newGroup.trim()}
          onClick={() => {
            const name = newGroup.trim()
            setExpanded(p => ({ ...p, [name]: true }))
            setNewGroup('')
            toast.success(`Pasta "${name}" criada`)
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-accent text-accent hover:bg-accent/10 disabled:opacity-40 transition-all">
          <Plus size={12} /> Criar pasta
        </button>
      </div>

      {/* Render groups */}
      {allGroups.map(g => (
        <div key={g} className="border border-border">
          <div
            className="flex items-center gap-2 px-3 py-2.5 bg-card cursor-pointer hover:bg-white/5 transition-all"
            onClick={() => toggleExpand(g)}>
            {expanded[g]
              ? <FolderOpen size={14} className="text-accent" />
              : <Folder size={14} className="text-accent" />}
            <span className="font-mono font-bold text-sm text-white">{g}</span>
            <span className="font-mono text-xs text-muted ml-1">
              ({(groupedDevices[g] || []).length} dispositivos)
            </span>
            <div className="ml-auto flex items-center gap-2" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => onCrawl(g)}
                className="flex items-center gap-1 px-2 py-1 text-xs font-mono border border-accent/50 text-accent hover:bg-accent/10 transition-all">
                <Play size={10} /> Crawl
              </button>
              {expanded[g] ? <ChevronDown size={14} className="text-muted" /> : <ChevronRight size={14} className="text-muted" />}
            </div>
          </div>

          {expanded[g] && (
            <div className="border-t border-border">
              {(groupedDevices[g] || []).length === 0 ? (
                <p className="px-4 py-3 text-xs font-mono text-muted italic">
                  Pasta vazia — arraste devices sem grupo para cá abaixo
                </p>
              ) : (
                (groupedDevices[g] || []).map(dev => (
                  <div key={dev.id} className="flex items-center gap-3 px-4 py-2 border-b border-border/50 hover:bg-white/3">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${dev.reachable ? 'bg-green-400' : 'bg-gray-600'}`} />
                    <span className="font-mono text-xs text-white flex-1">{dev.hostname || dev.ip}</span>
                    <span className="font-mono text-xs text-muted">{dev.ip}</span>
                    <button onClick={() => removeFromGroup(dev.id)}
                      className="p-1 text-muted hover:text-red-400 transition-all" title="Remover do grupo">
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))
              )}
              {/* Add ungrouped devices to this group */}
              {ungrouped.length > 0 && (
                <div className="px-4 py-2 border-t border-dashed border-border/50">
                  <p className="text-xs font-mono text-muted mb-1.5">Adicionar à pasta:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ungrouped.map(dev => (
                      <button key={dev.id} onClick={() => assignGroup(dev.id, g)}
                        className="px-2 py-0.5 text-xs font-mono border border-border text-muted hover:border-accent hover:text-accent transition-all">
                        + {dev.hostname || dev.ip}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Ungrouped devices */}
      {ungrouped.length > 0 && (
        <div className="border border-dashed border-border">
          <div className="flex items-center gap-2 px-3 py-2.5">
            <Folder size={14} className="text-muted" />
            <span className="font-mono text-sm text-muted">Sem grupo</span>
            <span className="font-mono text-xs text-muted ml-1">({ungrouped.length})</span>
          </div>
          {ungrouped.map(dev => (
            <div key={dev.id} className="flex items-center gap-3 px-4 py-2 border-t border-border/50">
              <span className={`w-2 h-2 rounded-full shrink-0 ${dev.reachable ? 'bg-green-400' : 'bg-gray-600'}`} />
              <span className="font-mono text-xs text-white flex-1">{dev.hostname || dev.ip}</span>
              <span className="font-mono text-xs text-muted">{dev.ip}</span>
              <select
                defaultValue=""
                onChange={e => e.target.value && assignGroup(dev.id, e.target.value)}
                className="bg-card border border-border font-mono text-xs text-white px-2 py-0.5 focus:outline-none focus:border-accent">
                <option value="">Mover para...</option>
                {allGroups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}

      {allGroups.length === 0 && ungrouped.length === 0 && (
        <div className="border border-dashed border-border p-12 text-center">
          <Folder size={32} className="text-muted mx-auto mb-3" />
          <p className="text-muted font-mono text-sm">Nenhum dispositivo cadastrado ainda.</p>
        </div>
      )}
    </div>
  )
}

export default function PhysicalPage() {
  const [tab, setTab]             = useState('devices')
  const [devices, setDevices]     = useState([])
  const [groups, setGroups]       = useState([])
  const [filterGroup, setFilterGroup] = useState('')
  const [topos, setTopos]         = useState([])
  const [activeTopo, setActiveTopo] = useState(null)
  const [loading, setLoading]     = useState(true)
  const [testing, setTesting]     = useState(null)
  const [crawling, setCrawling]   = useState(false)
  const [crawlId, setCrawlId]     = useState(null)
  const [showBulk, setShowBulk]   = useState(false)
  const [showAdd, setShowAdd]     = useState(false)
  const [newDev, setNewDev]       = useState({ ip: '', community: 'public', snmp_ver: '2c', group_name: '' })
  const pollRef = useRef(null)

  useEffect(() => {
    Promise.all([physicalApi.listDevices(), physicalApi.listTopologies(), physicalApi.listGroups()])
      .then(([d, t, g]) => {
        setDevices(d.data)
        setTopos(t.data)
        setGroups(g.data)
        if (t.data.length) setActiveTopo(t.data[0])
      }).finally(() => setLoading(false))
  }, [])

  // Poll crawl status until done
  useEffect(() => {
    if (!crawlId) return
    pollRef.current = setInterval(async () => {
      try {
        const r = await physicalApi.crawlStatus(crawlId)
        if (r.data.status === 'done') {
          clearInterval(pollRef.current)
          setCrawling(false)
          const m = r.data.meta || {}
          toast.success(`Crawl concluído! ${m.nodes_discovered || 0} nós · ${m.links_discovered || 0} links`)
          const [d, t] = await Promise.all([physicalApi.listDevices(), physicalApi.listTopologies()])
          setDevices(d.data); setTopos(t.data)
          if (t.data.length) { setActiveTopo(t.data[0]); setTab('topology') }
        } else if (r.data.status === 'error') {
          clearInterval(pollRef.current)
          setCrawling(false)
          toast.error(`Erro: ${r.data.error_msg}`)
        }
      } catch {}
    }, 2500)
    return () => clearInterval(pollRef.current)
  }, [crawlId])

  const addDevice = async () => {
    if (!newDev.ip.trim()) return toast.error('IP obrigatório')
    try {
      const r = await physicalApi.addDevice(newDev)
      setDevices(p => [...p, r.data])
      setNewDev({ ip: '', community: 'public', snmp_ver: '2c', group_name: newDev.group_name })
      setShowAdd(false)
      toast.success(`${newDev.ip} adicionado`)
      // refresh groups
      physicalApi.listGroups().then(g => setGroups(g.data))
    } catch (e) { toast.error(e?.response?.data?.detail || 'Erro') }
  }

  const bulkImport = async (list) => {
    try {
      const r = await physicalApi.addDevicesBulk(list)
      const d = await physicalApi.listDevices()
      setDevices(d.data)
      toast.success(`${r.data.added.length} adicionados${r.data.skipped.length ? ` · ${r.data.skipped.length} já existiam` : ''}`)
    } catch { toast.error('Erro na importação') }
  }

  const deleteDevice = async (id) => {
    if (!confirm('Remover dispositivo?')) return
    await physicalApi.deleteDevice(id)
    setDevices(p => p.filter(d => d.id !== id))
    toast.success('Removido')
  }

  const testDevice = async (id) => {
    setTesting(id)
    try {
      const r = await physicalApi.testDevice(id)
      setDevices(p => p.map(d => d.id === id
        ? { ...d, reachable: r.data.reachable, hostname: r.data.hostname || d.hostname, sys_descr: r.data.sys_descr || d.sys_descr, last_polled: new Date().toISOString() }
        : d))
      r.data.reachable ? toast.success(`${r.data.hostname || 'OK'} acessível`) : toast.error('Sem resposta SNMP')
    } catch { toast.error('Erro') }
    finally { setTesting(null) }
  }

  const testAll = async () => {
    toast('Testando todos...', { icon: '🔍' })
    for (const d of devices) await testDevice(d.id)
    toast.success('Teste concluído')
  }

  const startCrawl = async (groupOverride) => {
    if (!devices.length) return toast.error('Adicione dispositivos primeiro')
    const group = groupOverride !== undefined ? groupOverride : filterGroup
    setCrawling(true)
    try {
      const name = group
        ? `Topologia ${group} ${new Date().toLocaleString('pt-BR')}`
        : `Topologia ${new Date().toLocaleString('pt-BR')}`
      const r = await physicalApi.startCrawl({ name, group_name: group || null })
      setCrawlId(r.data.topology_id)
      toast(`Crawl LLDP iniciado em ${r.data.devices} dispositivos${group ? ` (${group})` : ''}`, { icon: '🕷️' })
    } catch (e) { setCrawling(false); toast.error(e?.response?.data?.detail || 'Erro') }
  }

  const reachable = devices.filter(d => d.reachable).length

  return (
    <div className="flex flex-col h-screen" style={{ background: C.bg }}>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface shrink-0">
        <Network size={16} className="text-accent" />
        <span className="font-bold font-mono text-white text-sm">Topologia Física</span>
        <span className="text-muted font-mono text-xs">SNMP + LLDP</span>
        <div className="ml-auto flex items-center gap-2">
          {devices.length > 0 && (
            <span className="text-xs font-mono text-muted">
              <span className="text-green-400">{reachable}</span>/{devices.length} online
            </span>
          )}
          {/* Group filter for crawl */}
          {groups.length > 1 && (
            <select value={filterGroup} onChange={e => setFilterGroup(e.target.value)}
              className="bg-card border border-border font-mono text-xs text-white px-2 py-1.5 focus:outline-none focus:border-accent">
              <option value="">Todos os grupos</option>
              {groups.filter(g => g.group).map(g => (
                <option key={g.group} value={g.group}>{g.group} ({g.count})</option>
              ))}
            </select>
          )}
          <button onClick={testAll} disabled={!devices.length}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-border text-muted hover:border-accent hover:text-accent transition-all disabled:opacity-40">
            <Wifi size={12} /> Testar todos
          </button>
          <button onClick={() => startCrawl()} disabled={crawling || !devices.length}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-accent bg-accent/10 text-accent font-bold hover:bg-accent/20 transition-all disabled:opacity-40">
            {crawling ? <><RefreshCw size={12} className="animate-spin" /> Crawling...</> : <><Play size={12} /> {filterGroup ? `Crawl: ${filterGroup}` : 'Iniciar Crawl'}</>}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border bg-surface shrink-0">
        {[
          ['devices',  `Dispositivos${devices.length ? ` (${devices.length})` : ''}`],
          ['groups',   `Grupos${groups.length ? ` (${groups.length})` : ''}`],
          ['topology', `Topologia${topos.length ? ` (${topos.length})` : ''}`],
        ].map(([k, lbl]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-5 py-2.5 text-xs font-mono border-b-2 transition-all
              ${tab === k ? 'text-accent border-accent' : 'text-muted border-transparent hover:text-white'}`}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Devices Tab */}
      {tab === 'devices' && (
        <div className="flex-1 overflow-auto p-4">
          <div className="flex gap-2 mb-4">
            <button onClick={() => setShowAdd(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-accent text-accent hover:bg-accent/10 transition-all">
              <Plus size={12} /> Adicionar IP
            </button>
            <button onClick={() => setShowBulk(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-border text-muted hover:border-accent hover:text-accent transition-all">
              <Upload size={12} /> Importar em lote
            </button>
          </div>

          {showAdd && (
            <div className="mb-4 p-3 bg-card border border-border flex items-end gap-3 flex-wrap">
              {[
                { label: 'IP *', key: 'ip', placeholder: '192.168.1.1', width: 'w-40' },
                { label: 'Community', key: 'community', placeholder: 'public', width: 'w-28' },
              ].map(({ label, key, placeholder, width }) => (
                <div key={key}>
                  <label className="text-xs font-mono text-muted block mb-1">{label}</label>
                  <input value={newDev[key]} onChange={e => setNewDev(p => ({ ...p, [key]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && addDevice()}
                    placeholder={placeholder}
                    className={`${width} bg-surface border border-border font-mono text-sm text-white px-2 py-1 focus:outline-none focus:border-accent`} />
                </div>
              ))}
              <div>
                <label className="text-xs font-mono text-muted block mb-1">Versão</label>
                <select value={newDev.snmp_ver} onChange={e => setNewDev(p => ({ ...p, snmp_ver: e.target.value }))}
                  className="bg-surface border border-border font-mono text-sm text-white px-2 py-1 focus:outline-none focus:border-accent">
                  <option value="2c">v2c</option>
                  <option value="1">v1</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-mono text-muted block mb-1">Grupo / Pasta</label>
                <input value={newDev.group_name} onChange={e => setNewDev(p => ({ ...p, group_name: e.target.value }))}
                  placeholder="ex: Conect BA"
                  list="group-suggestions"
                  className="w-36 bg-surface border border-border font-mono text-sm text-white px-2 py-1 focus:outline-none focus:border-accent" />
                <datalist id="group-suggestions">
                  {groups.filter(g => g.group).map(g => <option key={g.group} value={g.group} />)}
                </datalist>
              </div>
              <button onClick={addDevice} className="px-3 py-1.5 bg-accent text-bg font-mono text-sm font-bold hover:bg-accent/90">Adicionar</button>
              <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 border border-border text-muted font-mono text-sm hover:text-white">Cancelar</button>
            </div>
          )}

          {loading ? (
            <p className="text-center text-muted font-mono text-sm py-12 animate-pulse">// carregando...</p>
          ) : !devices.length ? (
            <div className="border border-dashed border-border p-12 text-center">
              <Network size={32} className="text-muted mx-auto mb-4" />
              <p className="text-muted font-mono text-sm mb-1">Nenhum dispositivo cadastrado.</p>
              <p className="text-muted font-mono text-xs">Adicione os IPs dos switches/roteadores para o crawl LLDP.</p>
            </div>
          ) : (
            <div className="border border-border overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border bg-card">
                    {['IP', 'Hostname', 'Grupo', 'Community', 'Versão', 'Status', 'sys_descr', ''].map(h => (
                      <th key={h} className="px-3 py-2 text-xs font-mono text-muted font-normal">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {devices.map(dev => (
                    <tr key={dev.id} className="border-b border-border hover:bg-white/5 transition-all">
                      <td className="px-3 py-2.5 font-mono text-sm text-white">
                        <span className={`inline-block w-2 h-2 rounded-full mr-2 ${dev.reachable ? 'bg-green-400' : 'bg-red-500'}`} />
                        {dev.ip}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-sm text-muted">{dev.hostname || '—'}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">
                        {dev.group_name
                          ? <span className="px-1.5 py-0.5 border border-blue-700 text-blue-300 bg-blue-900/30">{dev.group_name}</span>
                          : <span className="text-muted">—</span>}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-muted">{dev.community}</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-muted">{dev.snmp_ver}</td>
                      <td className="px-3 py-2.5">
                        <span className={`px-2 py-0.5 text-xs font-mono border rounded ${
                          dev.reachable ? 'bg-green-900/40 text-green-300 border-green-700'
                          : dev.last_polled ? 'bg-red-900/40 text-red-300 border-red-700'
                          : 'bg-gray-800 text-gray-400 border-gray-600'}`}>
                          {dev.reachable ? 'online' : dev.last_polled ? 'offline' : 'não testado'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs font-mono text-muted max-w-xs truncate" title={dev.sys_descr}>
                        {dev.sys_descr ? dev.sys_descr.slice(0, 45) + (dev.sys_descr.length > 45 ? '…' : '') : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1.5">
                          <button onClick={() => testDevice(dev.id)} disabled={testing === dev.id}
                            className="p-1.5 border border-border text-muted hover:border-accent hover:text-accent transition-all disabled:opacity-40">
                            {testing === dev.id ? <RefreshCw size={12} className="animate-spin" /> : <Wifi size={12} />}
                          </button>
                          <button onClick={() => deleteDevice(dev.id)}
                            className="p-1.5 border border-border text-muted hover:border-red-500 hover:text-red-400 transition-all">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Groups Tab */}
      {tab === 'groups' && (
        <GroupsTab
          groups={groups} devices={devices}
          onUpdate={() => Promise.all([physicalApi.listDevices(), physicalApi.listGroups()])
            .then(([d, g]) => { setDevices(d.data); setGroups(g.data) })}
          onCrawl={(g) => { startCrawl(g); setTab('topology') }}
        />
      )}

      {/* Topology Tab */}
      {tab === 'topology' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {topos.length > 1 && (
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-surface shrink-0">
              <span className="text-xs font-mono text-muted">Histórico:</span>
              <select value={activeTopo?.id || ''} onChange={e => setActiveTopo(topos.find(t => t.id === +e.target.value))}
                className="bg-card border border-border font-mono text-xs text-white px-2 py-1 focus:outline-none focus:border-accent">
                {topos.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {new Date(t.crawled_at).toLocaleString('pt-BR')}
                    {t.meta ? ` (${t.meta.nodes_discovered} nós)` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {crawling && (
            <div className="px-4 py-2.5 bg-accent/10 border-b border-accent/30 flex items-center gap-2 shrink-0">
              <RefreshCw size={13} className="text-accent animate-spin" />
              <span className="text-xs font-mono text-accent">
                Crawl LLDP em andamento — interrogando {devices.length} dispositivos...
              </span>
            </div>
          )}

          {!activeTopo ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <Network size={40} className="text-muted" />
              <p className="text-muted font-mono text-sm">Nenhuma topologia física ainda.</p>
              <p className="text-muted font-mono text-xs">Adicione dispositivos e clique em "Iniciar Crawl".</p>
              <button onClick={() => setTab('devices')} className="mt-2 px-4 py-2 border border-accent text-accent font-mono text-sm hover:bg-accent/10 transition-all">
                Gerenciar dispositivos →
              </button>
            </div>
          ) : (
            <div className="flex flex-1 overflow-hidden">
              <div className="flex-1 overflow-hidden">
                <PhysicalGraph graphData={activeTopo?.graph_data} />
              </div>
              {/* Stats sidebar */}
              <div className="w-52 border-l border-border bg-surface flex flex-col shrink-0">
                <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
                  <svg width="24" height="24" viewBox="0 0 100 100" fill="none">
                    <polygon points="15,25 35,25 50,45 65,25 85,25 60,55 85,80 65,80 50,62 35,80 15,80 40,55" fill="#b0bac8" opacity="0.5"/>
                    <polygon points="20,15 42,15 50,30 58,15 80,15 60,48 50,55 40,48" fill="#1a56ff"/>
                    <polygon points="40,58 50,65 60,58 75,80 55,80 50,72 45,80 25,80" fill="#1235cc"/>
                  </svg>
                  <div>
                    <p className="text-white font-bold text-sm leading-none">OpenX</p>
                    <p className="text-muted font-mono text-xs leading-none mt-0.5">NetVis · Físico</p>
                  </div>
                </div>
                <div className="p-3 space-y-3 text-xs font-mono overflow-y-auto flex-1">
                  <div>
                    <p className="text-muted uppercase text-xs mb-1">Crawl</p>
                    <p className="text-white">{new Date(activeTopo.crawled_at).toLocaleString('pt-BR')}</p>
                  </div>
                  {activeTopo.meta && (
                    <div className="space-y-1.5">
                      <p className="text-muted uppercase text-xs">Resumo</p>
                      {[
                        ['Dispositivos', activeTopo.meta.total_devices],
                        ['Responderam', activeTopo.meta.reachable],
                        ['Offline', activeTopo.meta.unreachable],
                        ['Nós no grafo', activeTopo.meta.nodes_discovered],
                        ['Links LLDP', activeTopo.meta.links_discovered],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between">
                          <span className="text-muted">{k}</span>
                          <span className={`font-bold ${k === 'Offline' && v > 0 ? 'text-red-400' : 'text-white'}`}>{v ?? '—'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="h-px bg-border" />
                  <button onClick={startCrawl} disabled={crawling}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-accent/10 border border-accent/30 text-accent hover:bg-accent/20 transition-all disabled:opacity-40 text-xs">
                    <RefreshCw size={11} className={crawling ? 'animate-spin' : ''} />
                    {crawling ? 'Crawling...' : 'Novo crawl'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {showBulk && <BulkModal onClose={() => setShowBulk(false)} onImport={bulkImport} />}
    </div>
  )
}
