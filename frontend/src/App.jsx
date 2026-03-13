import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Sidebar from './components/Sidebar'
import TopologyPage from './pages/TopologyPage'
import MonitorPage from './pages/MonitorPage'
import TopologyIndexPage from './pages/TopologyIndexPage'
import ClienteUnifiedPage from './pages/ClienteUnifiedPage'
import './styles/index.css'

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={{
        style: {
          background: '#1e3060', color: '#e8eaf0',
          border: '1px solid #2e4a7a',
          fontFamily: 'Space Mono, monospace', fontSize: '12px',
        },
        success: { iconTheme: { primary: '#00e5a0', secondary: '#0a0e1a' } },
        error:   { iconTheme: { primary: '#f85149', secondary: '#0a0e1a' } },
      }} />
      <Routes>
        {/* Full-screen pages (sem sidebar) */}
        <Route path="/view/:id"                      element={<TopologyPage />} />
        <Route path="/topology/client/:clientName"   element={<ClienteUnifiedPage />} />

        {/* Layout com sidebar */}
        <Route path="*" element={
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 overflow-auto">
              <Routes>
                <Route path="/"         element={<Navigate to="/topology" replace />} />
                <Route path="/topology" element={<TopologyIndexPage />} />
                <Route path="/monitor"  element={<MonitorPage />} />
                {/* Legacy */}
                <Route path="/physical"          element={<Navigate to="/topology" replace />} />
                <Route path="/physical/client/:g" element={<Navigate to="/topology" replace />} />
                <Route path="/ospf"              element={<Navigate to="/topology" replace />} />
                <Route path="/ospf/client/:g"    element={<Navigate to="/topology" replace />} />
                <Route path="/upload"            element={<Navigate to="/topology" replace />} />
              </Routes>
            </main>
          </div>
        } />
      </Routes>
    </BrowserRouter>
  )
}
