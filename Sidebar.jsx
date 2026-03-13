import { NavLink } from 'react-router-dom'
import { GitBranch, BarChart2 } from 'lucide-react'

const links = [
  { to: '/topology', icon: GitBranch, label: 'Topologia' },
  { to: '/monitor',  icon: BarChart2, label: 'Monitor'   },
]

export default function Sidebar() {
  return (
    <aside className="w-16 lg:w-56 bg-surface border-r border-border flex flex-col shrink-0 h-screen sticky top-0">
      <div className="p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <svg width="32" height="32" viewBox="0 0 100 100" fill="none">
            <polygon points="15,25 35,25 50,45 65,25 85,25 60,55 85,80 65,80 50,62 35,80 15,80 40,55" fill="#b0bac8" opacity="0.4"/>
            <polygon points="20,15 42,15 50,30 58,15 80,15 60,48 50,55 40,48" fill="#1a56ff"/>
            <polygon points="40,58 50,65 60,58 75,80 55,80 50,72 45,80 25,80" fill="#1235cc"/>
          </svg>
          <div className="hidden lg:block">
            <p className="font-bold text-white text-sm leading-none">OpenX</p>
            <p className="text-muted font-mono text-xs leading-none mt-0.5">NetVis</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-2 flex flex-col gap-1 mt-2">
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 transition-all text-sm font-mono border
              ${isActive
                ? 'bg-accent/10 text-accent border-accent/30'
                : 'text-muted hover:text-white hover:bg-white/5 border-transparent'
              }`}>
            <Icon size={15} />
            <span className="hidden lg:block">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-border">
        <p className="hidden lg:block text-xs text-muted font-mono">v2.1.0</p>
      </div>
    </aside>
  )
}
