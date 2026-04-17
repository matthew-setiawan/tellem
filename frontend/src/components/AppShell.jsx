import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { MessageCircle, Send, LogOut, Bot, Settings, Menu, X } from 'lucide-react'

export default function AppShell({ children }) {
  const { user, logout } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  function closeSidebar() { setSidebarOpen(false) }

  return (
    <div className="app-shell">
      {/* Mobile top bar */}
      <div className="mobile-header">
        <button className="mobile-header-btn" onClick={() => setSidebarOpen(true)}>
          <Menu size={22} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="sidebar-logo"><Send size={14} /></div>
          <span className="serif" style={{ fontSize: 17 }}>Tellem</span>
        </div>
      </div>

      {/* Overlay backdrop */}
      <div className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`} onClick={closeSidebar} />

      <aside className={`app-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="sidebar-logo">
            <Send size={16} />
          </div>
          <span className="sidebar-title serif">Tellem</span>
          <button className="mobile-header-btn sidebar-close-btn" onClick={closeSidebar} style={{ marginLeft: 'auto' }}>
            <X size={18} />
          </button>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/outbound" onClick={closeSidebar} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <Send size={18} />
            <span>Outbound</span>
          </NavLink>
          <NavLink to="/conversations" onClick={closeSidebar} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <Bot size={18} />
            <span>AI Management</span>
          </NavLink>
          <NavLink to="/chat" onClick={closeSidebar} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <MessageCircle size={18} />
            <span>Chat</span>
          </NavLink>
          <NavLink to="/settings" onClick={closeSidebar} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <Settings size={18} />
            <span>Settings</span>
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">
              {(user?.username || 'U')[0].toUpperCase()}
            </div>
            <span className="sidebar-user-name">{user?.username}</span>
          </div>
          <button className="sidebar-logout" onClick={logout} title="Logout">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      <main className="app-main">
        {children}
      </main>
    </div>
  )
}
