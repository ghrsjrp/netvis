import { useEffect, useRef, useState, useCallback } from 'react'
import { Network as VisNetwork } from 'vis-network'
import { DataSet } from 'vis-data'
import { physicalApi } from '../utils/api'
import toast from 'react-hot-toast'
import { RefreshCw, Server, GitBranch, Info, Wifi, WifiOff } from 'lucide-react'

// OpenX brand colors — physical topology
const C = {
  bg:          '#1a2744',
  nodeBg:      '#1e3060',
  nodeBorder:  '#1a56ff',
  nodeFont:    '#e8eaf0',
  // neighbor (discovered but not polled)
  neighborBg:  '#162038',
  neighborBorder: '#4a6fa5',
  edgeColor:   '#2e4a7a',
  edgeFont:    '#ffffff',
  edgeFontBg:  'rgba(15,21,32,0.85)',
  // highlights
  pathEdge:    '#00e5a0',
  failNode:    '#f85149', failNodeBg: '#3a1010',
  dimNode:     '#162038', dimBorder:  '#243656', dimEdge: '#1e3050',
}

const visOpts = (bg) => ({
  autoResize: true,
  physics: {
    enabled: true,
    solver: 'forceAtlas2Based',
    forceAtlas2Based: { gravitationalConstant: -80, springLength: 120, springConstant: 0.05, damping: 0.4 },
    stabilization: { iterations: 200, updateInterval: 25 },
  },
  nodes: {
    shape: 'box',
    borderWidth: 2,
    borderWidthSelected: 3,
    font: { color: C.nodeFont, size: 11, face: 'Space Mono, monospace' },
    shadow: { enabled: true, color: 'rgba(26,86,255,0.25)', x: 0, y: 0, size: 10 },
    margin: { top: 6, right: 10, bottom: 6, left: 10 },
  },
  edges: {
    width: 2,
    smooth: { type: 'cubicBezier', forceDirection: 'none', roundness: 0.4 },
    font: { size: 8, face: 'monospace', color: '#e0e8ff', strokeWidth: 2, strokeColor: 'rgba(10,14,26,0.9)', align: 'top' },
    color: { color: C.edgeColor, highlight: C.pathEdge, hover: '#3a5a9a', inherit: false },
    arrows: { to: { enabled: false } },
    selectionWidth: 2,
  },
  interaction: {
    hover: true, tooltipDelay: 200,
    navigationButtons: false, keyboard: true,
    multiselect: false, zoomView: true,
    zoomSpeed: 0.5,
  },
  layout: { improvedLayout: true },
  background: { color: C.bg },
})

export default function PhysicalGraph({ topologyId, showPortLabels = true, onNodeSelect }) {
  const containerRef = useRef(null)
  const networkRef   = useRef(null)
  const nodesRef     = useRef(null)
  const edgesRef     = useRef(null)

  const [topology, setTopology]     = useState(null)
  const [loading, setLoading]       = useState(true)
  const [selectedNode, setSelectedNode] = useState(null)
  const [sidePanel, setSidePanel]   = useState('info')

  const gd = topology?.graph_data || { nodes: [], edges: [] }

  // ── Load topology ───────────────────────────────────────
  const loadTopology = useCallback(async (id) => {
    setLoading(true)
    try {
      const r = id
        ? await physicalApi.getTopology(id)
        : await physicalApi.latestTopology()
      setTopology(r.data)
    } catch {
      toast.error('Topologia física não encontrada')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadTopology(topologyId) }, [topologyId, loadTopology])

  // ── Build vis-network ───────────────────────────────────
  useEffect(() => {
    if (!topology?.graph_data || !containerRef.current) return
    const gd = topology.graph_data

    const visNodes = gd.nodes.map(n => ({
      id:    n.id,
      label: n.label || n.id,
      title: `<div style="font-family:monospace;font-size:11px;padding:6px">
        <b>${n.label || n.id}</b><br/>
        IP: ${n.ip || n.id}<br/>
        ${n.sys_descr ? `<span style="color:#aaa">${n.sys_descr.slice(0,80)}</span>` : ''}
        ${n.type === 'neighbor' ? '<br/><i style="color:#f4c430">⚠ Não cadastrado</i>' : ''}
      </div>`,
      color: n.type === 'neighbor'
        ? { background: C.neighborBg, border: C.neighborBorder, highlight: { background: C.neighborBg, border: '#6a8fc5' }, inherit: false }
        : { background: C.nodeBg, border: C.nodeBorder, highlight: { background: '#1a2a50', border: '#4d7fff' }, inherit: false },
      font: { color: n.type === 'neighbor' ? '#8090b0' : C.nodeFont },
    }))

    const visEdges = gd.edges.map(e => {
      const localPort  = e.local_port  || ''
      const remotePort = e.remote_port || ''
      const label = showPortLabels
        ? (localPort && remotePort ? `${localPort}\n${remotePort}` : localPort || remotePort)
        : ''
      return {
        id:    e.id,
        from:  e.from,
        to:    e.to,
        label,
        title: `<div style="font-family:monospace;font-size:11px;padding:6px;line-height:1.8">
          <span style="color:#8899bb">${e.from}</span> <b style="color:#00e5a0">${localPort}</b><br/>
          <span style="color:#8899bb">${e.to}</span> <b style="color:#00e5a0">${remotePort}</b>
        </div>`,
        color: { color: C.edgeColor, inherit: false },
        font:  { color: '#e0e8ff', size: 8, face: 'monospace',
                 strokeWidth: 2, strokeColor: 'rgba(10,14,26,0.9)',
                 align: 'horizontal', multi: false },
      }
    })

    nodesRef.current = new DataSet(visNodes)
    edgesRef.current = new DataSet(visEdges)

    const net = new VisNetwork(
      containerRef.current,
      { nodes: nodesRef.current, edges: edgesRef.current },
      visOpts(C.bg)
    )
    networkRef.current = net

    net.on('selectNode', ({ nodes: sel }) => {
      if (!sel.length) return
      const nodeId = sel[0]
      if (String(nodeId).startsWith('__anchor_')) return
      const node = gd.nodes.find(n => n.id === nodeId)
      setSelectedNode(node || null)
      if (onNodeSelect) onNodeSelect(node || null)
    })
    net.on('deselectNode', () => { setSelectedNode(null); if (onNodeSelect) onNodeSelect(null) })

    // Prevent zoom from going too far out or in (causes topology to disappear)
    net.on('zoom', (params) => {
      const scale = net.getScale()
      if (scale < 0.05) net.moveTo({ scale: 0.05 })
      if (scale > 5)    net.moveTo({ scale: 5 })
    })

    return () => net.destroy()
  }, [topology?.id])

  // Toggle port labels without rebuilding the whole graph
  useEffect(() => {
    if (!edgesRef.current || !topology?.graph_data) return
    const gd = topology.graph_data
    const updates = gd.edges.map(e => {
      const localPort  = e.local_port  || ''
      const remotePort = e.remote_port || ''
      const label = showPortLabels
        ? (localPort && remotePort ? `${localPort}\n${remotePort}` : localPort || remotePort)
        : ''
      return { id: e.id, label }
    })
    edgesRef.current.update(updates)
  }, [showPortLabels, topology?.id])

  if (loading) return (
    <div className="flex-1 flex items-center justify-center" style={{ background: C.bg }}>
      <p className="text-accent font-mono text-sm animate-pulse">// carregando topologia física...</p>
    </div>
  )
  if (!topology) return (
    <div className="flex-1 flex items-center justify-center text-muted font-mono">
      Nenhuma topologia física ainda — faça um crawl primeiro.
    </div>
  )

  const meta = topology.meta || {}

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b shrink-0"
        style={{ background: '#0f1520', borderColor: '#1e2a3a' }}>
        <span className="font-mono text-xs text-muted">// TOPOLOGIA FÍSICA</span>
        <span className="font-mono text-xs text-accent ml-2">{topology.name}</span>
        <span className="font-mono text-xs text-muted ml-auto">
          {gd.nodes.length} nós · {gd.edges.length} links
        </span>
        <button onClick={() => loadTopology(topologyId)}
          className="flex items-center gap-1 px-2 py-1 border text-xs font-mono transition-all"
          style={{ borderColor: '#2e4a7a', color: '#7090b8' }}>
          <RefreshCw size={11} /> Recarregar
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Graph canvas */}
        <div ref={containerRef} className="flex-1" style={{ background: C.bg }} />

        {/* Side panel */}
        <div className="w-64 border-l flex flex-col overflow-hidden shrink-0"
          style={{ background: '#0f1520', borderColor: '#1e2a3a' }}>

          {/* OpenX logo */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b shrink-0"
            style={{ borderColor: '#1e2a3a' }}>
            <svg width="26" height="26" viewBox="0 0 100 100" fill="none">
              <polygon points="15,25 35,25 50,45 65,25 85,25 60,55 85,80 65,80 50,62 35,80 15,80 40,55" fill="#b0bac8" opacity="0.4"/>
              <polygon points="20,15 42,15 50,30 58,15 80,15 60,48 50,55 40,48" fill="#1a56ff"/>
              <polygon points="40,58 50,65 60,58 75,80 55,80 50,72 45,80 25,80" fill="#1235cc"/>
            </svg>
            <div>
              <p className="text-white font-bold text-sm leading-none">OpenX</p>
              <p className="text-muted font-mono text-xs leading-none mt-0.5">Physical</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b shrink-0" style={{ borderColor: '#1e2a3a' }}>
            {[['info','Info'],['nodes','Nós'],['edges','Links']].map(([k,lbl]) => (
              <button key={k} onClick={() => setSidePanel(k)}
                className="flex-1 py-2 text-xs font-mono transition-all"
                style={{ color: sidePanel === k ? '#1a56ff' : '#4a5568',
                  borderBottom: sidePanel === k ? '2px solid #1a56ff' : '2px solid transparent' }}>
                {lbl}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {sidePanel === 'info' && (
              <>
                {/* Crawl stats */}
                <div className="space-y-1.5">
                  <p className="text-xs font-mono text-muted uppercase tracking-wider">Crawl</p>
                  {[
                    ['Dispositivos', meta.total_devices],
                    ['Alcançados', meta.reachable],
                    ['Inacessíveis', meta.unreachable],
                    ['Nós descobertos', meta.nodes_discovered],
                    ['Links descobertos', meta.links_discovered],
                  ].map(([l, v]) => v !== undefined && (
                    <div key={l} className="flex justify-between text-xs font-mono">
                      <span className="text-muted">{l}</span>
                      <span className="text-white font-bold">{v}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-muted">Atualizado</span>
                    <span className="text-white">{topology.crawled_at
                      ? new Date(topology.crawled_at).toLocaleString('pt-BR')
                      : '—'}</span>
                  </div>
                </div>

                {/* Selected node info */}
                {selectedNode && (
                  <>
                    <div className="h-px" style={{ background: '#1e2a3a' }} />
                    <div className="space-y-1.5">
                      <p className="text-xs font-mono text-muted uppercase tracking-wider">Nó selecionado</p>
                      <p className="text-sm font-bold text-white font-mono break-all">{selectedNode.label}</p>
                      {selectedNode.ip && <p className="text-xs font-mono text-muted">{selectedNode.ip}</p>}
                      {selectedNode.sys_descr && (
                        <p className="text-xs font-mono text-muted leading-relaxed mt-1"
                          style={{ color: '#6b7a99' }}>
                          {selectedNode.sys_descr.slice(0, 120)}
                        </p>
                      )}
                      {selectedNode.type === 'neighbor' && (
                        <p className="text-xs font-mono" style={{ color: '#f4c430' }}>
                          ⚠ Descoberto via LLDP — não cadastrado
                        </p>
                      )}
                    </div>
                  </>
                )}

                {/* Legend */}
                <div className="h-px" style={{ background: '#1e2a3a' }} />
                <div className="space-y-1.5">
                  <p className="text-xs font-mono text-muted uppercase tracking-wider">Legenda</p>
                  <div className="flex items-center gap-2 text-xs font-mono">
                    <div className="w-4 h-4 border-2 rounded-sm" style={{ background: C.nodeBg, borderColor: C.nodeBorder }} />
                    <span className="text-muted">Dispositivo cadastrado</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-mono">
                    <div className="w-4 h-4 border-2 rounded-sm" style={{ background: C.neighborBg, borderColor: C.neighborBorder }} />
                    <span className="text-muted">Descoberto via LLDP</span>
                  </div>
                </div>
              </>
            )}

            {sidePanel === 'nodes' && (
              <div className="space-y-1">
                <p className="text-xs font-mono text-muted mb-2">{gd.nodes.length} nós</p>
                {gd.nodes.map(n => (
                  <div key={n.id}
                    onClick={() => { networkRef.current?.selectNodes([n.id]); setSelectedNode(n) }}
                    className="px-2 py-1.5 cursor-pointer border transition-all"
                    style={{
                      borderColor: selectedNode?.id === n.id ? '#1a56ff' : '#1e2a3a',
                      background: selectedNode?.id === n.id ? '#0a1433' : 'transparent',
                    }}>
                    <div className="flex items-center gap-2">
                      {n.type === 'neighbor'
                        ? <WifiOff size={10} style={{ color: '#4a6fa5' }} />
                        : <Wifi size={10} style={{ color: '#1a56ff' }} />}
                      <span className="text-xs font-mono text-white truncate">{n.label}</span>
                    </div>
                    {n.ip && n.ip !== n.id && (
                      <p className="text-xs font-mono pl-4" style={{ color: '#4a5568' }}>{n.ip}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {sidePanel === 'edges' && (
              <div className="space-y-1">
                <p className="text-xs font-mono text-muted mb-2">{gd.edges.length} links</p>
                {gd.edges.map(e => {
                  const src = gd.nodes.find(n => n.id === e.from)
                  const tgt = gd.nodes.find(n => n.id === e.to)
                  return (
                    <div key={e.id} className="px-2 py-1.5 border" style={{ borderColor: '#1e2a3a' }}>
                      <div className="flex items-center gap-1 text-xs font-mono">
                        <span className="text-white truncate">{src?.label || e.from}</span>
                        <span style={{ color: '#2e4a7a' }}>↔</span>
                        <span className="text-white truncate">{tgt?.label || e.to}</span>
                      </div>
                      {(e.local_port || e.remote_port) && (
                        <p className="text-xs font-mono mt-0.5" style={{ color: '#4a5568' }}>
                          {e.local_port} · {e.remote_port}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
