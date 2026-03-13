import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { Network as VisNetwork } from 'vis-network'
import { DataSet } from 'vis-data'
import { physicalApi } from '../utils/api'
import toast from 'react-hot-toast'
import { Plus, Trash2, RefreshCw, Wifi, Play, Upload,
         Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react'

const C = {
  bg: '#1a2744', nodeBg: '#1e3060', nodeBorder: '#1a56ff', nodeFont: '#e8eaf0',
  edge: '#2e4a7a', edgeFont: '#ffffff', edgeFontBg: 'rgba(15,21,32,0.85)',
  neighbor: '#f4c430', neighborBg: '#1a3300',
}

// ── Mini graph component ────────────────────────────────────
function TopoGraph({ graphData, showPorts, onNodeSelect }) {
  const containerRef = useRef(null)
  const netRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current || !graphData?.nodes?.length) return
    const nodes = new DataSet(graphData.nodes.map(n => ({
      id: n.id, label: n.label || n.id,
      title: `<div style="font-family:monospace;font-size:11px;padding:6px"><b>${n.label || n.id}</b><br/>IP: ${n.ip || n.id}${n.type==='neighbor'?'<br/><i style="color:#f4c430">⚠ Não cadastrado</i>':''}</div>`,
      shape: n.type === 'neighbor' ? 'diamond' : 'box',
      color: {
        background: n.type === 'neighbor' ? C.neighborBg : C.nodeBg,
        border:     n.type === 'neighbor' ? C.neighbor   : C.nodeBorder,
        highlight:  { background: '#0a1a40', border: '#4d7fff' },
      },
      font: { color: n.type === 'neighbor' ? '#c8a800' : C.nodeFont, size: 11, face: 'Space Mono' },
      borderWidth: 2,
    })))
    const edges = new DataSet(graphData.edges.map(e => ({
      id: e.id, from: e.from, to: e.to,
      label: showPorts ? (e.label || '') : '',
      color: { color: C.edge, inherit: false },
      font: { color: '#e0e8ff', size: 8, face: 'monospace', strokeWidth: 2, strokeColor: 'rgba(10,14,26,0.85)', align: 'middle' },
      width: 2,
    })))
    if (netRef.current) netRef.current.destroy()
    const net = new VisNetwork(containerRef.current, { nodes, edges }, {
      physics: { solver: 'forceAtlas2Based', forceAtlas2Based: { gravitationalConstant: -80, springLength: 120, springConstant: 0.06, damping: 0.5 }, stabilization: { iterations: 200 } },
      interaction: { hover: true, tooltipDelay: 200, zoomSpeed: 0.5 },
      background: { color: C.bg },
    })
    net.on('zoom', () => { const s = net.getScale(); if (s < 0.05) net.moveTo({ scale: 0.05 }); if (s > 5) net.moveTo({ scale: 5 }) })
    net.on('selectNode', ({ nodes: sel }) => { if (sel.length && onNodeSelect) onNodeSelect(graphData.nodes.find(n => n.id === sel[0])) })
    net.on('deselectNode', () => onNodeSelect && onNodeSelect(null))
    netRef.current = net
    return () => net.destroy()
  }, [graphData, showPorts])

  return <div ref={containerRef} className="w-full h-full" style={{ background: C.bg }} />
}

// ── Bulk modal ──────────────────────────────────────────────
function BulkModal({ groupName, onClose, onImport }) {
  const [text, setText]           = useState('')
  const [community, setCommunity] = useState('public')
  const [snmpVer, setSnmpVer]     = useState('2c')
  const parsed = text.trim().split('\n').map(l => l.trim()).filter(Boolean).map(line => {
    const [ip, comm, ver] = line.split(/[\s,;]+/)
    return { ip: ip?.trim(), community: comm || community, snmp_ver: ver || snmpVer, group_name: groupName }
  }).filter(d => d.ip)

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-border w-full max-w-lg">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-mono font-bold text-sm text-white">Importar IPs — {groupName}</h3>
          <button onClick={onClose} className="text-muted hover:text-white text-xl leading-none">×</button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs font-mono text-muted">Um IP por linha — <code className="text-accent">ip community versão</code></p>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={7}
            placeholder={"100.113.0.244\n100.113.0.246 Conecttelecom 2c"}
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

// ── Main ────────────────────────────────────────────────────
export default function ClientePage() {
  const { groupName } = useParams()
  const decodedGroup  = decodeURIComponent(groupName)

  const [devices, setDevices]       = useState([])
  const [topos, setTopos]           = useState([])
  const [activeTopo, setActiveTopo] = useState(null)
  const [loading, setLoading]       = useState(true)
  const [testing, setTesting]       = useState(null)
  const [crawling, setCrawling]     = useState(false)
  const [crawlId, setCrawlId]       = useState(null)
  const [showBulk, setShowBulk]     = useState(false)
  const [showAdd, setShowAdd]       = useState(false)
  const [showPorts, setShowPorts]   = useState(true)
  const [devicesOpen, setDevicesOpen] = useState(true)
  const [selectedNode, setSelectedNode] = useState(null)
  const [newDev, setNewDev]         = useState({ ip: '', community: 'public', snmp_ver: '2c' })
  const pollRef = useRef(null)

  const loadData = useCallback(async () => {
    try {
      const [dRes, tRes] = await Promise.all([physicalApi.listDevices(), physicalApi.listTopologies()])
      const groupDevs = dRes.data.filter(d => d.group_name === decodedGroup)
      const groupTopos = tRes.data.filter(t => t.group_name === decodedGroup)
      setDevices(groupDevs)
      setTopos(groupTopos)
      if (groupTopos.length && !activeTopo) setActiveTopo(groupTopos[0])
      else if (groupTopos.length) setActiveTopo(prev => groupTopos.find(t => t.id === prev?.id) || groupTopos[0])
    } catch {}
    setLoading(false)
  }, [decodedGroup])

  useEffect(() => { setLoading(true); setActiveTopo(null); loadData() }, [decodedGroup])

  // Poll crawl
  useEffect(() => {
    if (!crawlId) return
    pollRef.current = setInterval(async () => {
      try {
        const r = await physicalApi.crawlStatus(crawlId)
        if (r.data.status === 'done') {
          clearInterval(pollRef.current); setCrawling(false)
          const m = r.data.meta || {}
          toast.success(`Crawl concluído! ${m.nodes_discovered || 0} nós · ${m.links_discovered || 0} links`)
          await loadData()
        } else if (r.data.status === 'error') {
          clearInterval(pollRef.current); setCrawling(false)
          toast.error(`Erro: ${r.data.error_msg}`)
        }
      } catch {}
    }, 2500)
    return () => clearInterval(pollRef.current)
  }, [crawlId, loadData])

  const addDevice = async () => {
    if (!newDev.ip.trim()) return toast.error('IP obrigatório')
    try {
      await physicalApi.addDevice({ ...newDev, group_name: decodedGroup })
      setNewDev({ ip: '', community: 'public', snmp_ver: '2c' })
      setShowAdd(false)
      await loadData()
      toast.success(`${newDev.ip} adicionado`)
    } catch (e) { toast.error(e?.response?.data?.detail || 'Erro') }
  }

  const bulkImport = async (list) => {
    try {
      const r = await physicalApi.addDevicesBulk(list)
      await loadData()
      toast.success(`${r.data.added.length} adicionados${r.data.skipped.length ? ` · ${r.data.skipped.length} já existiam` : ''}`)
    } catch { toast.error('Erro na importação') }
  }

  const deleteDevice = async (id) => {
    if (!confirm('Remover dispositivo?')) return
    await physicalApi.deleteDevice(id); await loadData()
    toast.success('Removido')
  }

  const testDevice = async (id) => {
    setTesting(id)
    try {
      const r = await physicalApi.testDevice(id)
      await loadData()
      r.data.reachable ? toast.success(`${r.data.hostname || 'OK'} acessível`) : toast.error('Sem resposta SNMP')
    } catch { toast.error('Erro') }
    setTesting(null)
  }

  const testAll = async () => {
    toast('Testando todos...', { icon: '🔍' })
    for (const d of devices) await testDevice(d.id)
  }

  const startCrawl = async () => {
    if (!devices.length) return toast.error('Adicione dispositivos primeiro')
    setCrawling(true)
    try {
      const name = `${decodedGroup} — ${new Date().toLocaleString('pt-BR')}`
      const r = await physicalApi.startCrawl({ name, group_name: decodedGroup })
      setCrawlId(r.data.topology_id)
      toast(`Crawl iniciado em ${r.data.devices} dispositivos`, { icon: '🕷️' })
    } catch (e) { setCrawling(false); toast.error(e?.response?.data?.detail || 'Erro') }
  }

  const reachable = devices.filter(d => d.reachable).length

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: C.bg }}>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface shrink-0">
        <div className="w-2 h-2 rounded-full bg-accent" />
        <h1 className="font-bold font-mono text-white">{decodedGroup}</h1>
        <span className="text-muted font-mono text-xs">SNMP + LLDP</span>
        <div className="ml-auto flex items-center gap-2">
          {devices.length > 0 && (
            <span className="text-xs font-mono text-muted">
              <span className="text-green-400">{reachable}</span>/{devices.length} online
            </span>
          )}
          <button onClick={testAll} disabled={!devices.length}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-border text-muted hover:border-accent hover:text-accent transition-all disabled:opacity-40">
            <Wifi size={12} /> Testar
          </button>
          <button onClick={startCrawl} disabled={crawling || !devices.length}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-accent bg-accent/10 text-accent font-bold hover:bg-accent/20 transition-all disabled:opacity-40">
            {crawling
              ? <><RefreshCw size={12} className="animate-spin" /> Crawling...</>
              : <><Play size={12} /> Iniciar Crawl</>}
          </button>
        </div>
      </div>

      {/* Crawl progress bar */}
      {crawling && (
        <div className="px-4 py-2 bg-accent/10 border-b border-accent/30 flex items-center gap-2 shrink-0">
          <RefreshCw size={12} className="text-accent animate-spin" />
          <span className="text-xs font-mono text-accent">
            Interrogando {devices.length} dispositivos via SNMP/LLDP...
          </span>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">

        {/* Left: devices panel */}
        <div className="w-72 border-r border-border flex flex-col shrink-0 overflow-hidden" style={{ background: '#0f1520' }}>

          {/* Devices header */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
            <button onClick={() => setDevicesOpen(v => !v)} className="flex items-center gap-1.5 flex-1 text-left">
              <span className="text-xs font-mono text-muted uppercase tracking-wider">Dispositivos</span>
              <span className="text-xs font-mono text-muted">({devices.length})</span>
              {devicesOpen ? <ChevronUp size={11} className="text-muted ml-auto" /> : <ChevronDown size={11} className="text-muted ml-auto" />}
            </button>
          </div>

          {devicesOpen && (
            <>
              {/* Add device form */}
              <div className="px-3 py-2 border-b border-border space-y-1.5">
                <div className="flex gap-1.5">
                  <button onClick={() => setShowAdd(v => !v)}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-mono border border-accent/50 text-accent hover:bg-accent/10 transition-all">
                    <Plus size={11} /> Adicionar IP
                  </button>
                  <button onClick={() => setShowBulk(true)}
                    className="flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-mono border border-border text-muted hover:border-accent hover:text-accent transition-all">
                    <Upload size={11} />
                  </button>
                </div>

                {showAdd && (
                  <div className="space-y-1.5 pt-1">
                    <input value={newDev.ip} onChange={e => setNewDev(p => ({ ...p, ip: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && addDevice()}
                      placeholder="IP *" className="w-full bg-card border border-border font-mono text-xs text-white px-2 py-1.5 focus:outline-none focus:border-accent" />
                    <div className="flex gap-1.5">
                      <input value={newDev.community} onChange={e => setNewDev(p => ({ ...p, community: e.target.value }))}
                        placeholder="community" className="flex-1 bg-card border border-border font-mono text-xs text-white px-2 py-1.5 focus:outline-none focus:border-accent" />
                      <select value={newDev.snmp_ver} onChange={e => setNewDev(p => ({ ...p, snmp_ver: e.target.value }))}
                        className="bg-card border border-border font-mono text-xs text-white px-1 py-1.5 focus:outline-none focus:border-accent">
                        <option value="2c">v2c</option>
                        <option value="1">v1</option>
                      </select>
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={addDevice} className="flex-1 py-1.5 bg-accent text-bg font-mono text-xs font-bold hover:bg-accent/90">Adicionar</button>
                      <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 border border-border text-muted font-mono text-xs hover:text-white">✕</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Device list */}
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <p className="text-center text-muted font-mono text-xs py-8 animate-pulse">// carregando...</p>
                ) : devices.length === 0 ? (
                  <div className="p-4 text-center">
                    <p className="text-muted font-mono text-xs mb-2">Nenhum dispositivo ainda.</p>
                    <p className="text-muted font-mono text-xs opacity-60">Adicione IPs acima para começar.</p>
                  </div>
                ) : (
                  devices.map(dev => (
                    <div key={dev.id} className="px-3 py-2.5 border-b border-border/50 hover:bg-white/3 transition-all">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${dev.reachable ? 'bg-green-400' : dev.last_polled ? 'bg-red-500' : 'bg-gray-600'}`} />
                        <span className="font-mono text-xs text-white flex-1 truncate">{dev.hostname || dev.ip}</span>
                        <div className="flex gap-1 shrink-0">
                          <button onClick={() => testDevice(dev.id)} disabled={testing === dev.id}
                            className="p-1 text-muted hover:text-accent transition-all disabled:opacity-40">
                            {testing === dev.id ? <RefreshCw size={11} className="animate-spin" /> : <Wifi size={11} />}
                          </button>
                          <button onClick={() => deleteDevice(dev.id)}
                            className="p-1 text-muted hover:text-red-400 transition-all">
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs font-mono ml-4 mt-0.5" style={{ color: '#4a5568' }}>{dev.ip}</p>
                      {dev.sys_descr && (
                        <p className="text-xs font-mono ml-4 mt-0.5 truncate" style={{ color: '#3a4a60' }} title={dev.sys_descr}>
                          {dev.sys_descr.slice(0, 40)}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {/* Topology history */}
          {topos.length > 0 && (
            <div className="border-t border-border shrink-0">
              <div className="px-3 py-2 border-b border-border">
                <span className="text-xs font-mono text-muted uppercase tracking-wider">Histórico de Crawls</span>
              </div>
              <div className="overflow-y-auto max-h-40">
                {topos.map(t => (
                  <button key={t.id} onClick={() => setActiveTopo(t)}
                    className={`w-full text-left px-3 py-2 border-b border-border/50 transition-all hover:bg-white/5
                      ${activeTopo?.id === t.id ? 'bg-accent/5 border-l-2 border-l-accent' : ''}`}>
                    <p className="text-xs font-mono text-white truncate">{new Date(t.crawled_at).toLocaleString('pt-BR')}</p>
                    {t.meta && (
                      <p className="text-xs font-mono mt-0.5" style={{ color: '#4a5568' }}>
                        {t.meta.nodes_discovered} nós · {t.meta.links_discovered} links
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: topology graph */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {activeTopo?.graph_data ? (
            <>
              {/* Graph toolbar */}
              <div className="flex items-center gap-3 px-3 py-2 border-b border-border shrink-0" style={{ background: '#0f1520' }}>
                <span className="font-mono text-xs text-muted">
                  {activeTopo.graph_data.nodes?.length || 0} nós · {activeTopo.graph_data.edges?.length || 0} links
                </span>
                <span className="font-mono text-xs" style={{ color: '#3a4a60' }}>
                  {new Date(activeTopo.crawled_at).toLocaleString('pt-BR')}
                </span>
                <button onClick={() => setShowPorts(v => !v)}
                  className="ml-auto flex items-center gap-1.5 px-2 py-1 text-xs font-mono border border-border text-muted hover:text-white transition-all">
                  {showPorts ? <EyeOff size={11} /> : <Eye size={11} />}
                  {showPorts ? 'Ocultar' : 'Mostrar'} portas
                </button>
              </div>

              <div className="flex flex-1 overflow-hidden">
                <TopoGraph
                  graphData={activeTopo.graph_data}
                  showPorts={showPorts}
                  onNodeSelect={setSelectedNode}
                />

                {/* Node info panel */}
                {selectedNode && (
                  <div className="w-52 border-l border-border flex flex-col shrink-0 overflow-y-auto p-3 space-y-2"
                    style={{ background: '#0f1520' }}>
                    <p className="text-xs font-mono text-muted uppercase tracking-wider">Nó selecionado</p>
                    <p className="text-sm font-bold text-white font-mono break-all">{selectedNode.label}</p>
                    {selectedNode.ip && <p className="text-xs font-mono text-muted">{selectedNode.ip}</p>}
                    {selectedNode.sys_descr && (
                      <p className="text-xs font-mono leading-relaxed" style={{ color: '#6b7a99' }}>
                        {selectedNode.sys_descr.slice(0, 120)}
                      </p>
                    )}
                    {selectedNode.type === 'neighbor' && (
                      <p className="text-xs font-mono" style={{ color: '#f4c430' }}>⚠ Descoberto via LLDP</p>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3" style={{ background: C.bg }}>
              {crawling ? (
                <>
                  <RefreshCw size={32} className="text-accent animate-spin" />
                  <p className="text-accent font-mono text-sm">Crawl em andamento...</p>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 border-2 border-dashed border-border flex items-center justify-center">
                    <Play size={24} className="text-muted" />
                  </div>
                  <p className="text-muted font-mono text-sm">
                    {devices.length === 0 ? 'Adicione dispositivos e inicie o crawl.' : 'Clique em "Iniciar Crawl" para descobrir a topologia.'}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {showBulk && <BulkModal groupName={decodedGroup} onClose={() => setShowBulk(false)} onImport={bulkImport} />}
    </div>
  )
}
