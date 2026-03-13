import { useEffect, useRef, useState, useCallback } from 'react'
import { Network } from 'vis-network'
import { DataSet } from 'vis-data'
import toast from 'react-hot-toast'
import { topologyApi } from '../utils/api'
import {
  GitBranch, Zap, AlertTriangle, Flame, RotateCcw,
  Save, Wifi, Edit3, Check, X, ChevronRight, PenLine
} from 'lucide-react'

// ── Colors ────────────────────────────────────────────────
// OpenX brand — fundo azul médio, linhas de caminho verdes
const C = {
  bg:           '#1a2744',   // azul médio — legível e com identidade OpenX
  nodeBg:       '#1e3060',   // nó ligeiramente mais claro que o fundo
  nodeBorder:   '#1a56ff',   // OpenX electric blue
  nodeFont:     '#e8eaf0',
  edgeNormal:   '#2e4a7a',   // azul visível sobre o fundo
  edgeLabel:    '#1a1a2e',
  edgeLabelBg:  'rgba(26,39,68,0.7)',
  pathNode:     '#00e5a0', pathNodeBg:   '#003322', pathEdge: '#00e5a0',   // verde — caminho ativo
  backupNode:   '#f4c430', backupNodeBg: '#2a2000', backupEdge: '#f4c430', // amarelo — backup
  failNode:     '#f85149', failNodeBg:   '#3a1010', failEdge: '#f85149',   // vermelho — falha
  dimNode:      '#162038', dimBorder:    '#243656', dimEdge: '#1e3050',
}

function nodeDefaults(n) {
  return {
    id: n.id, label: n.label || n.id, x: n.x || 0, y: n.y || 0,
    color: {
      background: C.nodeBg, border: C.nodeBorder,
      highlight: { background: '#0a1a40', border: '#4d7fff' },
      hover: { background: '#0d1833', border: '#1a56ff' },
    },
    font: { color: C.nodeFont, face: 'Space Mono', size: 12 },
    shape: 'box', borderWidth: 1.5,
    shadow: { enabled: true, color: 'rgba(0,229,160,0.18)', x: 0, y: 0, size: 10 },
  }
}

function edgeDefaults(e) {
  return {
    id: e.id, from: e.from, to: e.to, label: String(e.cost),
    color: { color: C.edgeNormal, highlight: C.pathEdge, hover: '#2a4a8a' },
    font: { color: C.edgeLabel, face: 'Space Mono', size: 10, background: C.edgeLabelBg },
    width: 2, smooth: { type: 'curvedCW', roundness: 0.1 },
  }
}

// ── NodeRow ───────────────────────────────────────────────
// Sanitize before saving — removes vis-network internal properties
function sanitizeGD(gd) {
  return {
    ...gd,
    nodes: (gd.nodes || []).map(n => ({
      id: n.id, label: n.label, x: n.x, y: n.y,
    })),
    edges: (gd.edges || []).map(e => ({
      id: e.id, from: e.from, to: e.to, cost: e.cost,
    })),
  }
}

function NodeRow({ n }) {
  return (
    <div className="flex items-center gap-2 py-1.5 px-2 hover:bg-white/5 text-xs font-mono">
      <div className="w-2 h-2 bg-accent shrink-0" />
      <span className="text-white truncate">{n.label}</span>
      {n.label !== n.id && <span className="text-muted truncate ml-auto">{n.id}</span>}
    </div>
  )
}

// ── EdgeRow with inline cost edit ─────────────────────────
function EdgeRow({ e, onEditCost }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(String(e.cost))

  const commit = () => {
    const num = parseInt(val)
    if (isNaN(num) || num < 1) { setVal(String(e.cost)); setEditing(false); return }
    onEditCost(e.id, num)
    setEditing(false)
  }

  return (
    <div className="flex items-center gap-1 py-1 px-2 hover:bg-white/5 text-xs font-mono group">
      <span className="text-muted truncate flex-1 min-w-0">{e.from}</span>
      <span className="text-border shrink-0 mx-0.5">↔</span>
      <span className="text-muted truncate flex-1 min-w-0">{e.to}</span>
      {editing ? (
        <div className="flex items-center gap-0.5 ml-1 shrink-0">
          <input autoFocus value={val}
            onChange={ev => setVal(ev.target.value)}
            onKeyDown={ev => { if (ev.key === 'Enter') commit(); if (ev.key === 'Escape') setEditing(false) }}
            className="w-14 bg-bg border border-accent px-1 py-0 text-xs font-mono text-accent focus:outline-none" />
          <button onClick={commit} className="text-accent hover:text-white p-0.5"><Check size={11} /></button>
          <button onClick={() => setEditing(false)} className="text-muted hover:text-white p-0.5"><X size={11} /></button>
        </div>
      ) : (
        <div className="flex items-center gap-1 ml-1 shrink-0">
          <span className="text-warn w-10 text-right">{e.cost}</span>
          <button onClick={() => { setVal(String(e.cost)); setEditing(true) }}
            className="opacity-0 group-hover:opacity-100 text-muted hover:text-accent transition-all p-0.5">
            <Edit3 size={11} />
          </button>
        </div>
      )}
    </div>
  )
}

// ── SNMP Panel ────────────────────────────────────────────
function SnmpPanel({ topologyId, topology, onLabelsUpdated }) {
  const [community, setCommunity] = useState('public')
  const [version, setVersion] = useState('2c')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState([])

  const run = async () => {
    const nodes = topology?.graph_data?.nodes
    if (!nodes?.length) return toast.error('Sem nós')
    setLoading(true); setResults([])
    const out = []
    for (const node of nodes) {
      try {
        const r = await fetch(`/api/topologies/${topologyId}/snmp-hostname`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ip: node.id, community, version }),
        })
        if (r.ok) {
          const d = await r.json()
          out.push({ ip: node.id, hostname: d.hostname, ok: true })
        } else {
          out.push({ ip: node.id, hostname: null, ok: false })
        }
      } catch { out.push({ ip: node.id, hostname: null, ok: false }) }
    }
    setResults(out); setLoading(false)
    const ok = out.filter(x => x.ok && x.hostname)
    if (ok.length) { onLabelsUpdated(ok); toast.success(`${ok.length} hostnames obtidos`) }
    else toast.error('Nenhum hostname — verifique community/acesso')
  }

  return (
    <div className="p-3 space-y-3">
      <p className="text-xs font-mono text-muted border-b border-border pb-2">// SNMP HOSTNAME</p>
      <div className="space-y-2">
        <div>
          <label className="block text-xs font-mono text-muted mb-1">Community String</label>
          <input value={community} onChange={e => setCommunity(e.target.value)}
            className="w-full bg-bg border border-border px-2 py-1.5 text-xs font-mono text-white focus:border-accent focus:outline-none" />
        </div>
        <div>
          <label className="block text-xs font-mono text-muted mb-1">Versão SNMP</label>
          <select value={version} onChange={e => setVersion(e.target.value)}
            className="w-full bg-bg border border-border px-2 py-1.5 text-xs font-mono text-white focus:border-accent focus:outline-none">
            <option value="1">SNMPv1</option>
            <option value="2c">SNMPv2c</option>
          </select>
        </div>
      </div>
      <button onClick={run} disabled={loading}
        className="w-full py-2 bg-accent text-bg font-mono font-bold text-xs hover:bg-accent/90 disabled:opacity-40 flex items-center justify-center gap-1.5">
        <Wifi size={12} /> {loading ? 'Consultando...' : `Consultar ${topology?.graph_data?.nodes?.length || 0} nós`}
      </button>
      {results.length > 0 && (
        <div className="border border-border max-h-52 overflow-y-auto">
          {results.map(r => (
            <div key={r.ip} className="flex items-center gap-1 text-xs font-mono px-2 py-1 hover:bg-white/5">
              <span className="text-muted w-28 truncate shrink-0">{r.ip}</span>
              <ChevronRight size={10} className="text-border shrink-0" />
              <span className={`truncate ${r.ok ? 'text-accent' : 'text-accent3'}`}>
                {r.hostname || 'timeout'}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted font-mono">OID: <span className="text-white">sysName.0 (1.3.6.1.2.1.1.5.0)</span></p>
    </div>
  )
}

// ── Edge Cost Modal ───────────────────────────────────────
function EdgeCostModal({ edge, onConfirm, onCancel }) {
  const [val, setVal] = useState(String(edge.cost))
  const inputRef = useRef(null)
  useEffect(() => { setTimeout(() => inputRef.current?.select(), 50) }, [])

  const commit = () => {
    const num = parseInt(val)
    if (isNaN(num) || num < 1) return toast.error('Custo deve ser ≥ 1')
    onConfirm(num)
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center z-50 bg-black/60">
      <div className="bg-surface border border-accent/40 p-5 shadow-2xl w-80">
        <p className="text-xs font-mono text-muted mb-1">// EDITAR CUSTO OSPF</p>
        <p className="text-sm font-bold text-white mb-1">
          {edge.from} <span className="text-muted">↔</span> {edge.to}
        </p>
        <p className="text-xs font-mono text-muted mb-4">
          Custo atual: <span className="text-warn font-bold">{edge.cost}</span>
        </p>
        <div className="flex gap-3 items-end mb-4">
          <div className="flex-1">
            <label className="block text-xs font-mono text-muted mb-1">Novo custo</label>
            <input ref={inputRef} type="number" min={1} value={val}
              onChange={e => setVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') onCancel() }}
              className="w-full bg-bg border border-accent px-3 py-2 text-lg font-mono text-accent focus:outline-none" />
          </div>
          <div className="text-center pb-1">
            <p className="text-xs font-mono text-muted">atual</p>
            <p className="text-2xl font-mono text-warn leading-none">{edge.cost}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={commit}
            className="flex-1 py-2.5 bg-accent text-bg font-mono font-bold text-sm hover:bg-accent/90 flex items-center justify-center gap-1.5">
            <Check size={14} /> Aplicar
          </button>
          <button onClick={onCancel}
            className="flex-1 py-2.5 border border-border text-muted font-mono text-sm hover:text-white flex items-center justify-center gap-1.5">
            <X size={14} /> Cancelar
          </button>
        </div>
        <p className="text-xs font-mono text-muted mt-2 text-center">
          Caminhos ativos serão recalculados
        </p>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────
export default function TopologyGraph({ topologyId }) {
  const containerRef  = useRef(null)
  const networkRef    = useRef(null)
  const nodesRef      = useRef(null)
  const edgesRef      = useRef(null)
  // Refs to share latest state with vis-network callbacks (avoids stale closures)
  const modeRef       = useRef('normal')
  const topoRef       = useRef(null)
  const resultRef     = useRef(null)

  const [topology, setTopology]       = useState(null)
  const [loading, setLoading]         = useState(true)
  const [mode, setMode]               = useState('normal')
  const [selection, setSelection]     = useState([])
  const [result, setResult]           = useState(null)
  const [stats, setStats]             = useState(null)
  const [sidePanel, setSidePanel]     = useState('info')
  const [editingEdge, setEditingEdge] = useState(null)
  const [rerouteNode, setRerouteNode] = useState(null)   // triggers node-fail reroute in SP mode
  const [rerouteEdge, setRerouteEdge] = useState(null)   // triggers link-fail reroute in SP mode

  // Keep refs in sync
  useEffect(() => { modeRef.current = mode }, [mode])
  useEffect(() => { topoRef.current = topology }, [topology])
  useEffect(() => { resultRef.current = result }, [result])

  // ── Load topology ──────────────────────────────────────
  useEffect(() => {
    if (!topologyId) return
    setLoading(true)
    topologyApi.get(topologyId)
      .then(r => { setTopology(r.data); setLoading(false) })
      .catch(() => { toast.error('Erro ao carregar'); setLoading(false) })
    topologyApi.stats(topologyId).then(r => setStats(r.data)).catch(() => {})
  }, [topologyId])

  // ── Build vis-network ──────────────────────────────────
  useEffect(() => {
    if (!topology || !containerRef.current) return
    const gd = topology.graph_data
    if (!gd) return

    const nodes = new DataSet(gd.nodes.map(nodeDefaults))
    const edges = new DataSet(gd.edges.map(edgeDefaults))
    nodesRef.current = nodes
    edgesRef.current = edges

    const network = new Network(containerRef.current, { nodes, edges }, {
      physics: {
        enabled: true,
        stabilization: { iterations: 200, fit: true },
        barnesHut: { gravitationalConstant: -12000, springLength: 150, springConstant: 0.04 },
      },
      interaction: { hover: true, selectConnectedEdges: true, tooltipDelay: 150, multiselect: false },
      edges: { arrows: { to: { enabled: false } } },
    })

    network.on('beforeDrawing', ctx => {
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.fillStyle = C.bg
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
      ctx.restore()
    })

    networkRef.current = network

    // Use refs to avoid stale closures
    network.on('selectNode', ({ nodes: sel }) => {
      const m = modeRef.current
      const res = resultRef.current

      // SP mode with active path: 3rd+ click = simulate node failure & reroute
      if (m === 'sp' && res?.type === 'sp') {
        const nodeId = sel[0]
        if (!nodeId) return
        if (nodeId === res.src || nodeId === res.tgt) {
          // clicked src/tgt again — ignore, don't re-trigger
          return
        }
        setRerouteNode(nodeId)
        return
      }

      // Normal SP mode: accumulate 2 nodes then auto-calculate
      if (m === 'sp') {
        setSelection(prev => [...new Set([...prev, ...sel.map(String)])].slice(-2))
        return
      }

      // Other modes
      setSelection(prev => [...new Set([...prev, ...sel.map(String)])].slice(-2))
    })

    network.on('selectEdge', ({ edges: selEdges }) => {
      if (!selEdges.length) return
      const m = modeRef.current
      const res = resultRef.current
      const top = topoRef.current
      if (!top?.graph_data) return

      // EC mode: open cost editor
      if (m === 'ec') {
        const found = top.graph_data.edges.find(e => e.id === selEdges[0])
        if (found) setEditingEdge(found)
        return
      }

      // SP mode with active path: clicking a link = simulate link failure & reroute
      if (m === 'sp' && res?.type === 'sp') {
        const found = top.graph_data.edges.find(e => e.id === selEdges[0])
        if (found) setRerouteEdge(found)
        return
      }
    })

    network.on('dragEnd', async ({ nodes: dragged }) => {
      if (!dragged.length) return
      const pos = network.getPositions(dragged)
      const top = topoRef.current
      if (!top) return
      const updatedNodes = top.graph_data.nodes.map(n => ({
        ...n, ...(pos[n.id] ? { x: pos[n.id].x, y: pos[n.id].y } : {}),
      }))
      const newGD = sanitizeGD({ ...top.graph_data, nodes: updatedNodes })
      setTopology(prev => ({ ...prev, graph_data: newGD }))
      try { await topologyApi.update(topologyId, { graph_data: newGD }) } catch {}
    })

    return () => network.destroy()
  }, [topology?.id])

  // ── Reset all highlights ───────────────────────────────
  const resetHighlights = useCallback(() => {
    const top = topoRef.current
    if (!top || !nodesRef.current || !edgesRef.current) return
    nodesRef.current.update(top.graph_data.nodes.map(n => ({
      id: n.id,
      color: { background: C.nodeBg, border: C.nodeBorder },
      borderWidth: 1.5,
      shadow: { enabled: true, color: 'rgba(0,229,160,0.18)', x: 0, y: 0, size: 10 },
    })))
    edgesRef.current.update(top.graph_data.edges.map(e => ({
      id: e.id, color: { color: C.edgeNormal, inherit: false }, width: 2, dashes: false,
    })))
    setResult(null)
    setSelection([])
    setEditingEdge(null)
    setRerouteNode(null)
    setRerouteEdge(null)
  }, [])

  const switchMode = useCallback((m) => {
    resetHighlights()
    setMode(m)
  }, [resetHighlights])

  // ── Apply visual highlight ─────────────────────────────
  const applyHighlight = useCallback((pathNodes, pathEdges, backupNodes = [], backupEdges = [], failEdges = [], failNodes = []) => {
    const top = topoRef.current
    if (!top) return
    const pn = new Set(pathNodes), pe = new Set(pathEdges)
    const bn = new Set(backupNodes), be = new Set(backupEdges)
    const fe = new Set(failEdges), fn = new Set(failNodes)

    nodesRef.current.update(top.graph_data.nodes.map(n => {
      if (fn.has(n.id)) return { id: n.id, color: { background: C.failNodeBg, border: C.failNode }, borderWidth: 2.5, shadow: { enabled: true, color: C.failNode + '55', x: 0, y: 0, size: 14 } }
      if (pn.has(n.id)) return { id: n.id, color: { background: C.pathNodeBg, border: C.pathNode }, borderWidth: 2.5, shadow: { enabled: true, color: C.pathNode + '55', x: 0, y: 0, size: 14 } }
      if (bn.has(n.id)) return { id: n.id, color: { background: C.backupNodeBg, border: C.backupNode }, borderWidth: 2.5, shadow: { enabled: true, color: C.backupNode + '55', x: 0, y: 0, size: 14 } }
      return { id: n.id, color: { background: C.dimNode, border: C.dimBorder }, borderWidth: 1, shadow: { enabled: false } }
    }))

    edgesRef.current.update(top.graph_data.edges.map(e => {
      if (fe.has(e.id)) return { id: e.id, color: { color: C.failEdge, highlight: C.failEdge, hover: C.failEdge, inherit: false }, width: 3, dashes: [8, 5] }
      if (pe.has(e.id)) return { id: e.id, color: { color: C.pathEdge, highlight: C.pathEdge, hover: C.pathEdge, inherit: false }, width: 4, dashes: false }
      if (be.has(e.id)) return { id: e.id, color: { color: C.backupEdge, highlight: C.backupEdge, hover: C.backupEdge, inherit: false }, width: 4, dashes: false }
      return { id: e.id, color: { color: C.dimEdge, inherit: false }, width: 1, dashes: false }
    }))
  }, [])

  // ── Shortest path ──────────────────────────────────────
  const runShortestPath = useCallback(async (sel) => {
    const pair = sel || selection
    if (pair.length < 2) return toast.error('Selecione 2 nós')
    const [src, tgt] = pair
    try {
      const r = await topologyApi.shortestPath(topologyId, src, tgt)
      const d = r.data
      if (d.error) return toast.error(d.error)
      applyHighlight(d.path, d.edges)
      setResult({ type: 'sp', data: d, src, tgt })
      setRerouteNode(null)
      setRerouteEdge(null)
      toast.success(`✓ ${d.hops} hop${d.hops !== 1 ? 's' : ''} · custo ${d.total_cost}`)
    } catch { toast.error('Erro no cálculo') }
  }, [selection, topologyId, applyHighlight])

  // ── Reroute on node failure (SP mode click) ────────────
  useEffect(() => {
    if (!rerouteNode) return
    const top = topoRef.current
    const res = resultRef.current
    if (!top || !res || res.type !== 'sp') return
    const { src, tgt } = res

    ;(async () => {
      try {
        const [failRes, rerouteRes] = await Promise.all([
          topologyApi.simulateNodeFailure(topologyId, rerouteNode),
          topologyApi.shortestPath(topologyId, src, tgt, [rerouteNode]),
        ])
        const failData = failRes.data
        const rerouteData = rerouteRes.data

        const failEdgeIds = top.graph_data.edges
          .filter(e => e.from === rerouteNode || e.to === rerouteNode)
          .map(e => e.id)

        applyHighlight(
          rerouteData.error ? [] : rerouteData.path,   // green nodes = new path
          rerouteData.error ? [] : rerouteData.edges,  // green edges = new path
          [],
          [],
          failEdgeIds,                                 // red dashed = failed node links
          [rerouteNode],                               // red node = failed
        )

        if (rerouteData.error || !rerouteData.path?.length) {
          setResult({ type: 'nf_reroute', failData, nodeId: rerouteNode, src, tgt, reroute: null })
          toast('Sem rota alternativa sem esse nó', { icon: '🔴' })
        } else {
          setResult({ type: 'nf_reroute', failData, nodeId: rerouteNode, src, tgt, reroute: rerouteData })
          toast.success(`Reroute: ${rerouteData.hops} hops · custo ${rerouteData.total_cost}`)
        }
      } catch { toast.error('Erro na simulação de falha') }
      finally { setRerouteNode(null) }
    })()
  }, [rerouteNode]) // eslint-disable-line

  // ── Reroute on link failure (SP mode click) ────────────
  useEffect(() => {
    if (!rerouteEdge) return
    const top = topoRef.current
    const res = resultRef.current
    if (!top || !res || res.type !== 'sp') return
    const { src, tgt } = res

    ;(async () => {
      try {
        const r = await topologyApi.simulateLinkFailure(topologyId, {
          edge_from: rerouteEdge.from,
          edge_to: rerouteEdge.to,
          source: src,
          target: tgt,
        })
        const d = r.data
        const backup = d.affected_paths?.[0]

        // Find backup edge IDs from backup path
        let bEdges = []
        if (backup?.backup_path?.length > 1) {
          const bp = backup.backup_path
          for (let i = 0; i < bp.length - 1; i++) {
            const found = top.graph_data.edges.find(e =>
              ((e.from === bp[i] && e.to === bp[i+1]) || (e.from === bp[i+1] && e.to === bp[i])) &&
              e.id !== rerouteEdge.id
            )
            if (found) bEdges.push(found.id)
          }
        }

        applyHighlight(
          backup?.backup_path?.length > 1 ? backup.backup_path : [],  // green nodes = reroute
          bEdges,                                                       // green edges = reroute
          [],
          [],
          [rerouteEdge.id],                                             // red dashed = failed link
          [],
        )

        setResult({ type: 'lf_reroute', data: d, failEdge: rerouteEdge, src, tgt, backup })

        if (d.network_partitioned) toast('⚠️ Rede particionada!', { icon: '🔴' })
        else if (backup?.backup_path?.length > 1) toast.success(`Reroute via: ${backup.backup_path.join(' → ')}`)
        else toast('Sem backup path para esse link', { icon: '🟡' })
      } catch { toast.error('Erro na simulação de falha') }
      finally { setRerouteEdge(null) }
    })()
  }, [rerouteEdge]) // eslint-disable-line

  // ── Link failure + show backup path ───────────────────
  const runLinkFail = useCallback(async () => {
    if (selection.length < 2) return toast.error('Selecione 2 nós')
    const [from, to] = selection
    const top = topoRef.current
    if (!top) return
    try {
      const r = await topologyApi.simulateLinkFailure(topologyId, {
        edge_from: from, edge_to: to, source: from, target: to,
      })
      const d = r.data
      const failEdge = top.graph_data.edges.find(e =>
        (e.from === from && e.to === to) || (e.from === to && e.to === from)
      )
      const backup = d.affected_paths?.[0]
      let bNodes = [], bEdges = []
      if (backup?.backup_path?.length > 1) {
        bNodes = backup.backup_path
        const bp = backup.backup_path
        for (let i = 0; i < bp.length - 1; i++) {
          const found = top.graph_data.edges.find(e =>
            ((e.from === bp[i] && e.to === bp[i + 1]) || (e.from === bp[i + 1] && e.to === bp[i])) &&
            e.id !== failEdge?.id
          )
          if (found) bEdges.push(found.id)
        }
      }
      applyHighlight([], [], bNodes, bEdges, failEdge ? [failEdge.id] : [], [from, to])
      setResult({ type: 'lf', data: d, from, to, backup })
      if (d.network_partitioned) toast('⚠️ Rede particionada!', { icon: '🔴' })
      else if (backup?.backup_path?.length > 1) toast.success(`Backup: ${backup.backup_path.join(' → ')}`)
      else toast('Sem backup path', { icon: '🟡' })
    } catch { toast.error('Erro na simulação') }
  }, [selection, topologyId, applyHighlight])

  // ── Node failure (standalone or reroute when SP is active) ──
  const runNodeFail = useCallback(async (forceNodeId) => {
    const nodeId = forceNodeId || selection[0]
    if (!nodeId) return toast.error('Selecione um nó')
    const top = topoRef.current
    if (!top) return

    const activeSp = resultRef.current?.type === 'sp' ? resultRef.current : null

    // Reroute mode: active SP + failing a node on that path
    if (activeSp) {
      const { src, tgt } = activeSp
      if (nodeId === src || nodeId === tgt) {
        toast.error('Não é possível remover origem ou destino do caminho ativo')
        return
      }
      try {
        const [failRes, rerouteRes] = await Promise.all([
          topologyApi.simulateNodeFailure(topologyId, nodeId),
          topologyApi.shortestPath(topologyId, src, tgt, [nodeId]),
        ])
        const failData = failRes.data
        const rerouteData = rerouteRes.data

        const failEdgeIds = top.graph_data.edges
          .filter(e => e.from === nodeId || e.to === nodeId)
          .map(e => e.id)

        applyHighlight(
          [],
          [],
          rerouteData.error ? [] : rerouteData.path,
          rerouteData.error ? [] : rerouteData.edges,
          failEdgeIds,
          [nodeId],
        )

        if (rerouteData.error || !rerouteData.path?.length) {
          setResult({ type: 'nf_reroute', failData, nodeId, src, tgt, reroute: null })
          toast('Sem rota alternativa sem esse nó', { icon: '🔴' })
        } else {
          setResult({ type: 'nf_reroute', failData, nodeId, src, tgt, reroute: rerouteData })
          toast.success(`Reroute: ${rerouteData.hops} hops · custo ${rerouteData.total_cost}`)
        }
      } catch { toast.error('Erro na simulação') }
      return
    }

    // Standalone node failure
    try {
      const r = await topologyApi.simulateNodeFailure(topologyId, nodeId)
      const d = r.data
      nodesRef.current.update(top.graph_data.nodes.map(n => ({
        id: n.id,
        color: n.id === nodeId
          ? { background: C.failNodeBg, border: C.failNode }
          : d.neighbors_affected.includes(n.id)
          ? { background: C.backupNodeBg, border: C.backupNode }
          : { background: C.dimNode, border: C.dimBorder },
        borderWidth: n.id === nodeId ? 3 : 1,
        shadow: n.id === nodeId ? { enabled: true, color: C.failNode + '55', x: 0, y: 0, size: 14 } : { enabled: false },
      })))
      edgesRef.current.update(top.graph_data.edges.map(e => ({
        id: e.id,
        color: { color: (e.from === nodeId || e.to === nodeId) ? C.failEdge : C.dimEdge, inherit: false },
        width: (e.from === nodeId || e.to === nodeId) ? 3 : 1,
        dashes: (e.from === nodeId || e.to === nodeId) ? [8, 5] : false,
      })))
      setResult({ type: 'nf', data: d, nodeId })
      toast(`Nó removido · ${d.neighbors_affected.length} vizinhos afetados${d.network_partitioned ? ' ⚠️ PARTIÇÃO!' : ''}`)
    } catch (err) { console.error('Node fail error:', err?.response?.data || err); toast.error(`Erro: ${err?.response?.data?.detail || err?.message || 'simulação falhou'}`) }
  }, [selection, topologyId, applyHighlight])

  // ── Heatmap ────────────────────────────────────────────
  const runHeatmap = useCallback(async () => {
    const top = topoRef.current
    if (!top) return
    try {
      const r = await topologyApi.heatmap(topologyId)
      const d = r.data
      const maxV = Math.max(...Object.values(d), 0.001)
      nodesRef.current.update(Object.entries(d).map(([id, val]) => {
        const ratio = val / maxV
        const rv = Math.round(255 * ratio), gv = Math.round(120 * (1 - ratio))
        return {
          id,
          color: { background: `rgba(${rv},${gv},40,0.3)`, border: `rgb(${rv},${gv},40)` },
          borderWidth: 1.5 + ratio * 2,
          shadow: { enabled: true, color: `rgb(${rv},${gv},40)`, x: 0, y: 0, size: 8 + ratio * 10 },
        }
      }))
      setResult({ type: 'hm', data: d })
      toast.success('Heatmap calculado')
    } catch { toast.error('Erro no heatmap') }
  }, [topologyId])

  // ── Edit edge cost ─────────────────────────────────────
  const handleEditCost = useCallback(async (edgeId, newCost) => {
    const top = topoRef.current
    if (!top) return
    const newEdges = top.graph_data.edges.map(e =>
      e.id === edgeId ? { ...e, cost: newCost } : e
    )
    const newGD = sanitizeGD({ ...top.graph_data, edges: newEdges })
    setTopology(prev => ({ ...prev, graph_data: newGD }))
    edgesRef.current?.update([{ id: edgeId, label: String(newCost) }])
    setEditingEdge(null)
    try {
      await topologyApi.update(topologyId, { graph_data: newGD })
      toast.success(`Custo → ${newCost}`)
      // Recalculate active shortest path
      const cur = resultRef.current
      if (cur?.type === 'sp') {
        const r2 = await topologyApi.shortestPath(topologyId, cur.src, cur.tgt)
        if (!r2.data.error) {
          applyHighlight(r2.data.path, r2.data.edges)
          setResult(prev => ({ ...prev, data: r2.data }))
          toast(`↺ Caminho recalculado · custo ${r2.data.total_cost}`, { icon: '🔄' })
        }
      }
    } catch { toast.error('Erro ao salvar custo') }
  }, [topologyId, applyHighlight])

  // ── SNMP label update ──────────────────────────────────
  const handleSnmpLabels = useCallback(async (updates) => {
    const top = topoRef.current
    if (!top) return
    const map = {}
    updates.forEach(u => { map[u.ip] = u.hostname })
    const newNodes = top.graph_data.nodes.map(n => ({ ...n, label: map[n.id] || n.label }))
    const newGD = sanitizeGD({ ...top.graph_data, nodes: newNodes })
    setTopology(prev => ({ ...prev, graph_data: newGD }))
    nodesRef.current?.update(updates.map(u => ({ id: u.ip, label: u.hostname })))
    try { await topologyApi.update(topologyId, { graph_data: newGD }) }
    catch { toast.error('Erro ao salvar labels') }
  }, [topologyId])

  // ── Auto-run shortest path on 2nd node select ─────────
  useEffect(() => {
    if (mode === 'sp' && selection.length === 2) {
      runShortestPath(selection)
    }
  }, [selection]) // eslint-disable-line

  const saveSnapshot = useCallback(async () => {
    try { await topologyApi.createSnapshot(topologyId); toast.success('Snapshot salvo!') }
    catch { toast.error('Erro') }
  }, [topologyId])

  // ── Render ─────────────────────────────────────────────
  if (loading) return (
    <div className="flex-1 flex items-center justify-center" style={{ background: C.bg }}>
      <p className="text-accent font-mono text-sm animate-pulse">// carregando topologia...</p>
    </div>
  )
  if (!topology) return (
    <div className="flex-1 flex items-center justify-center text-muted font-mono">Topologia não encontrada</div>
  )

  const gd = topology.graph_data || { nodes: [], edges: [] }

  return (
    <div className="flex flex-col h-full relative">

      {/* ── Toolbar ─────────────────────────────────────── */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border bg-surface flex-wrap shrink-0">
        <span className="font-mono text-xs text-muted mr-1 hidden md:block">// ANÁLISE</span>

        <button onClick={() => switchMode('sp')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono border transition-all
            ${mode === 'sp' ? 'border-accent text-accent bg-accent/10' : 'border-border text-muted hover:border-accent hover:text-accent'}`}>
          <GitBranch size={13}/> Menor caminho
        </button>

        <button onClick={() => switchMode('lf')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono border transition-all
            ${mode === 'lf' ? 'border-accent3 text-accent3 bg-accent3/10' : 'border-border text-muted hover:border-accent3 hover:text-accent3'}`}>
          <Zap size={13}/> Falha de link
        </button>

        <button onClick={() => switchMode('nf')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono border transition-all
            ${mode === 'nf' ? 'border-warn text-warn bg-warn/10' : 'border-border text-muted hover:border-warn hover:text-warn'}`}>
          <AlertTriangle size={13}/> Falha de nó
        </button>

        <button onClick={() => switchMode('ec')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono border transition-all
            ${mode === 'ec' ? 'border-warn text-warn bg-warn/10' : 'border-border text-muted hover:border-warn hover:text-warn'}`}>
          <PenLine size={13}/> Editar custos
        </button>

        <button onClick={() => { switchMode('hm'); runHeatmap() }}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono border transition-all
            ${mode === 'hm' ? 'border-accent2 text-accent2 bg-accent2/10' : 'border-border text-muted hover:border-accent2 hover:text-accent2'}`}>
          <Flame size={13}/> Heatmap
        </button>

        <div className="flex-1" />

        <button onClick={() => { switchMode('normal'); setSidePanel('snmp') }}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono border transition-all
            ${sidePanel === 'snmp' ? 'border-accent2 text-accent2 bg-accent2/10' : 'border-border text-muted hover:border-accent2 hover:text-accent2'}`}>
          <Wifi size={13}/> SNMP
        </button>

        <button onClick={saveSnapshot}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono border border-border text-muted hover:border-accent hover:text-accent transition-all">
          <Save size={13}/> Snapshot
        </button>

        <button onClick={() => { resetHighlights(); setMode('normal') }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono border border-border text-muted hover:text-white transition-all">
          <RotateCcw size={13}/> Reset
        </button>
      </div>

      {/* ── Context hint bar ────────────────────────────── */}
      {mode !== 'normal' && mode !== 'hm' && (
        <div className={`flex items-center justify-between px-4 py-2 border-b text-xs font-mono shrink-0
          ${mode === 'sp' ? 'bg-accent/5 border-accent/20 text-accent' :
            mode === 'lf' ? 'bg-accent3/5 border-accent3/20 text-accent3' :
            'bg-warn/5 border-warn/20 text-warn'}`}>
          <span>
            {mode === 'sp' && !result && (selection.length < 2
              ? `🎯 Clique em 2 nós — caminho calculado automaticamente (${selection.length}/2)`
              : `Calculando ${selection[0]} → ${selection[1]}...`)}
            {mode === 'sp' && result?.type === 'sp' &&
              `✓ ${result.src} → ${result.tgt} · Agora clique num nó ou link do caminho para simular falha e ver o reroute`}
            {mode === 'sp' && (result?.type === 'nf_reroute' || result?.type === 'lf_reroute') &&
              `Reroute calculado — clique em outro elemento para nova simulação, ou Reset para recomeçar`}
            {mode === 'lf' && (selection.length < 2
              ? `⚡ Clique nos 2 endpoints do link para simular falha + ver backup path (${selection.length}/2)`
              : `Pronto: ${selection[0]} ↔ ${selection[1]}`)}
            {mode === 'nf' && result?.type === 'sp' && (
              selection.length < 1
                ? `🔀 Caminho ${result.src} → ${result.tgt} ativo — clique num nó intermediário para simular falha e ver reroute`
                : `Simular falha de ${selection[0]} e calcular reroute ${result.src} → ${result.tgt}`
            )}
            {mode === 'nf' && result?.type !== 'sp' && (!selection.length ? `⚠️ Clique no nó a remover` : `Pronto: ${selection[0]}`)}
            {mode === 'ec' && `✏️ Clique em um link no grafo para editar o custo — ou use hover na aba Links`}
          </span>
          <div className="flex gap-2">
            {mode === 'lf' && selection.length >= 2 && (
              <button onClick={runLinkFail} className="px-3 py-1 bg-accent3 text-white hover:bg-accent3/90 font-mono">
                Simular
              </button>
            )}
            {mode === 'nf' && selection.length >= 1 && (
              <button onClick={() => runNodeFail()} className="px-3 py-1 bg-warn text-bg hover:bg-warn/90 font-mono">
                Simular
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Legend strip ────────────────────────────────── */}
      {(result?.type === 'nf_reroute' || result?.type === 'lf_reroute') && (
        <div className="flex items-center gap-5 px-4 py-1.5 bg-surface border-b border-border text-xs font-mono shrink-0 flex-wrap">
          {result.type === 'nf_reroute' && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 border" style={{ background: C.failNodeBg, borderColor: C.failNode }} />
              <span className="text-muted">Nó falho</span>
            </div>
          )}
          {result.type === 'lf_reroute' && (
            <div className="flex items-center gap-2">
              <div className="w-8 border-t-2 border-dashed" style={{ borderColor: C.failEdge }} />
              <span className="text-muted">Link falho</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="w-8 border-t-2" style={{ borderColor: C.pathEdge }} />
            <span className="text-muted">Reroute</span>
          </div>
          {(result.type === 'nf_reroute' && !result.reroute) ||
           (result.type === 'lf_reroute' && !result.backup?.backup_path?.length) ? (
            <span className="text-accent3 font-bold ml-auto animate-pulse">⚠ SEM ROTA ALTERNATIVA</span>
          ) : null}
        </div>
      )}}
      {result?.type === 'lf' && (
        <div className="flex items-center gap-5 px-4 py-1.5 bg-surface border-b border-border text-xs font-mono shrink-0 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-8 border-t-2 border-dashed" style={{ borderColor: C.failEdge }} />
            <span className="text-muted">Link falho</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 border-t-2" style={{ borderColor: C.backupEdge }} />
            <span className="text-muted">Backup path</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 border" style={{ background: C.failNodeBg, borderColor: C.failNode }} />
            <span className="text-muted">Endpoints</span>
          </div>
          {result.data?.network_partitioned && (
            <span className="text-accent3 font-bold ml-auto animate-pulse">⚠ REDE PARTICIONADA</span>
          )}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">

        {/* ── Canvas ────────────────────────────────────── */}
        <div ref={containerRef} className="flex-1" style={{ background: C.bg, minHeight: 400 }} />

        {/* ── Side panel ────────────────────────────────── */}
        <div className="w-64 border-l border-border bg-surface flex flex-col overflow-hidden shrink-0">
          {/* OpenX logo header */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-surface shrink-0">
            <svg width="28" height="28" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Grey X arms */}
              <polygon points="15,25 35,25 50,45 65,25 85,25 60,55 85,80 65,80 50,62 35,80 15,80 40,55" fill="#b0bac8" opacity="0.5"/>
              {/* Blue electric X - top part (checkmark style) */}
              <polygon points="20,15 42,15 50,30 58,15 80,15 60,48 50,55 40,48" fill="#1a56ff"/>
              {/* Blue dark X - bottom part */}
              <polygon points="40,58 50,65 60,58 75,80 55,80 50,72 45,80 25,80" fill="#1235cc"/>
            </svg>
            <div>
              <p className="text-white font-bold text-sm leading-none">OpenX</p>
              <p className="text-muted font-mono text-xs leading-none mt-0.5">NetVis</p>
            </div>
          </div>
          <div className="flex border-b border-border shrink-0">
            {[['info','Info'],['nodes','Nós'],['edges','Links'],['snmp','SNMP']].map(([k, lbl]) => (
              <button key={k} onClick={() => setSidePanel(k)}
                className={`flex-1 py-2 text-xs font-mono transition-all
                  ${sidePanel === k ? 'text-accent border-b-2 border-accent' : 'text-muted hover:text-white'}`}>
                {lbl}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">

            {sidePanel === 'info' && (
              <div className="p-3 space-y-4">
                <div>
                  <p className="text-xs font-mono text-muted mb-1">// TOPOLOGIA</p>
                  <p className="text-sm font-bold text-white">{topology.name}</p>
                  <p className="text-xs text-muted font-mono">{topology.protocol?.toUpperCase()} · Área {topology.area}</p>
                </div>

                {stats && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-mono text-muted">// STATS</p>
                    {[
                      ['Nós', stats.nodes],
                      ['Links', stats.edges],
                      ['Conectado', stats.connected ? '✓ Sim' : '✗ Não'],
                      ['Componentes', stats.components],
                      ['Diâmetro', stats.diameter ?? '—'],
                      ['Avg path', stats.avg_shortest_path ?? '—'],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between text-xs font-mono">
                        <span className="text-muted">{k}</span>
                        <span className={k === 'Conectado'
                          ? (String(v).startsWith('✓') ? 'text-accent' : 'text-accent3')
                          : 'text-white'}>{v}</span>
                      </div>
                    ))}
                  </div>
                )}

                {result && (
                  <div className="border border-border p-2.5 space-y-2">
                    <p className="text-xs font-mono text-muted">// RESULTADO</p>
                    {result.type === 'sp' && (
                      <>
                        <div className="flex justify-between text-xs font-mono">
                          <span className="text-muted">Custo total</span>
                          <span className="text-accent font-bold">{result.data.total_cost}</span>
                        </div>
                        <div className="flex justify-between text-xs font-mono">
                          <span className="text-muted">Hops</span>
                          <span className="text-white">{result.data.hops}</span>
                        </div>
                        <p className="text-xs font-mono text-accent leading-relaxed break-all">
                          {result.data.path?.join(' → ')}
                        </p>
                      </>
                    )}
                    {result.type === 'lf' && (
                      <>
                        <p className={`text-xs font-mono font-bold ${result.data?.network_partitioned ? 'text-accent3' : 'text-warn'}`}>
                          {result.data?.network_partitioned ? '⚠ Rede particionada' : '✓ Backup encontrado'}
                        </p>
                        {result.backup?.backup_path?.length > 1 && (
                          <>
                            <div className="flex justify-between text-xs font-mono">
                              <span className="text-muted">Custo backup</span>
                              <span className="text-warn font-bold">{result.backup.backup_cost}</span>
                            </div>
                            <p className="text-xs font-mono text-warn leading-relaxed break-all">
                              {result.backup.backup_path.join(' → ')}
                            </p>
                          </>
                        )}
                      </>
                    )}
                    {result.type === 'nf_reroute' && (
                      <>
                        <p className="text-xs font-mono text-accent3 font-bold">Nó falho: {result.nodeId}</p>
                        <div className="flex justify-between text-xs font-mono">
                          <span className="text-muted">Rota original</span>
                          <span className="text-muted">{result.src} → {result.tgt}</span>
                        </div>
                        {result.reroute ? (
                          <>
                            <div className="h-px bg-border my-1" />
                            <p className="text-xs font-mono text-warn font-bold">✓ Reroute encontrado</p>
                            <div className="flex justify-between text-xs font-mono">
                              <span className="text-muted">Custo</span>
                              <span className="text-warn font-bold">{result.reroute.total_cost}</span>
                            </div>
                            <div className="flex justify-between text-xs font-mono">
                              <span className="text-muted">Hops</span>
                              <span className="text-white">{result.reroute.hops}</span>
                            </div>
                            <p className="text-xs font-mono text-warn leading-relaxed break-all">
                              {result.reroute.path?.join(' → ')}
                            </p>
                          </>
                        ) : (
                          <p className="text-xs font-mono text-accent3 font-bold">⚠ Sem rota alternativa</p>
                        )}
                        <div className="h-px bg-border my-1" />
                        <p className="text-xs font-mono text-muted">{result.failData?.neighbors_affected?.length} vizinhos afetados</p>
                      </>
                    )}
                    {result.type === 'lf_reroute' && (
                      <>
                        <p className="text-xs font-mono text-accent3 font-bold">
                          Link falho: {result.failEdge?.from} ↔ {result.failEdge?.to}
                        </p>
                        <div className="flex justify-between text-xs font-mono">
                          <span className="text-muted">Rota original</span>
                          <span className="text-muted">{result.src} → {result.tgt}</span>
                        </div>
                        {result.backup?.backup_path?.length > 1 ? (
                          <>
                            <div className="h-px bg-border my-1" />
                            <p className="text-xs font-mono text-accent font-bold">✓ Reroute encontrado</p>
                            <div className="flex justify-between text-xs font-mono">
                              <span className="text-muted">Custo</span>
                              <span className="text-accent font-bold">{result.backup.backup_cost}</span>
                            </div>
                            <p className="text-xs font-mono text-accent leading-relaxed break-all">
                              {result.backup.backup_path.join(' → ')}
                            </p>
                          </>
                        ) : (
                          <p className="text-xs font-mono text-accent3 font-bold">
                            {result.data?.network_partitioned ? '⚠ Rede particionada' : '⚠ Sem rota alternativa'}
                          </p>
                        )}
                      </>
                    )}
                    {result.type === 'nf' && (
                      <>
                        <p className="text-xs font-mono text-warn">{result.data.neighbors_affected.length} vizinhos afetados</p>
                        {result.data.lost_connections.map((c, i) => (
                          <p key={i} className="text-xs font-mono text-accent3">✗ {c.from} ↔ {c.to}</p>
                        ))}
                        {result.data.network_partitioned && (
                          <p className="text-xs font-mono text-accent3 font-bold">⚠ PARTIÇÃO</p>
                        )}
                      </>
                    )}
                    {result.type === 'hm' && (
                      <div className="space-y-1.5">
                        {Object.entries(result.data).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([node, val]) => {
                          const max = Math.max(...Object.values(result.data))
                          return (
                            <div key={node} className="space-y-0.5">
                              <div className="flex justify-between text-xs font-mono">
                                <span className="text-white truncate max-w-32">{node}</span>
                                <span className="text-warn">{(val * 100).toFixed(1)}%</span>
                              </div>
                              <div className="w-full bg-border h-1">
                                <div className="h-1 bg-warn transition-all" style={{ width: `${(val / max) * 100}%` }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                <div className="border border-warn/20 p-2 bg-warn/5">
                  <p className="text-xs font-mono text-warn mb-1">// ENGENHARIA DE TRÁFEGO</p>
                  <p className="text-xs font-mono text-muted leading-relaxed">
                    Use <span className="text-warn">Editar custos</span> + <span className="text-accent">Menor caminho</span> para simular redistribuição de tráfego OSPF.
                  </p>
                </div>
              </div>
            )}

            {sidePanel === 'nodes' && (
              <div>
                <p className="text-xs font-mono text-muted px-2 py-2 border-b border-border">{gd.nodes.length} roteadores</p>
                {gd.nodes.map(n => <NodeRow key={n.id} n={n} />)}
              </div>
            )}

            {sidePanel === 'edges' && (
              <div>
                <div className="flex items-center justify-between px-2 py-2 border-b border-border">
                  <p className="text-xs font-mono text-muted">{gd.edges.length} links</p>
                  <span className="text-xs font-mono text-muted flex items-center gap-1">hover <Edit3 size={10} /></span>
                </div>
                {gd.edges.map(e => <EdgeRow key={e.id} e={e} onEditCost={handleEditCost} />)}
              </div>
            )}

            {sidePanel === 'snmp' && (
              <SnmpPanel topologyId={topologyId} topology={topology} onLabelsUpdated={handleSnmpLabels} />
            )}
          </div>
        </div>
      </div>

      {/* ── Cost edit modal ──────────────────────────────── */}
      {editingEdge && (
        <EdgeCostModal
          edge={editingEdge}
          onConfirm={cost => handleEditCost(editingEdge.id, cost)}
          onCancel={() => setEditingEdge(null)}
        />
      )}
    </div>
  )
}
