import { useParams, Link } from 'react-router-dom'
import TopologyGraph from '../components/TopologyGraph'
import { ArrowLeft } from 'lucide-react'

export default function TopologyPage() {
  const { id } = useParams()

  return (
    <div className="flex flex-col h-screen">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-surface shrink-0">
        <Link to="/" className="flex items-center gap-1.5 text-xs font-mono text-muted hover:text-white transition-colors">
          <ArrowLeft size={13} /> Voltar
        </Link>
        <span className="text-border">|</span>
        <span className="text-xs font-mono text-muted">// VISUALIZADOR DE TOPOLOGIA</span>
      </div>
      <div className="flex-1 overflow-hidden">
        <TopologyGraph topologyId={Number(id)} />
      </div>
    </div>
  )
}
