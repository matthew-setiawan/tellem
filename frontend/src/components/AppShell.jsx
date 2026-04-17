import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { MessageCircle, Send, LogOut, Bot, Settings } from 'lucide-react'

export default function AppShell({ children }) {
  const { user, logout } = useAuth()

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-logo">
            <Send size={16} />
          </div>
          <span className="sidebar-title serif">Tellem</span>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/outbound" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <Send size={18} />
            <span>Outbound</span>
          </NavLink>
          <NavLink to="/conversations" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <Bot size={18} />
            <span>AI Management</span>
          </NavLink>
          <NavLink to="/chat" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <MessageCircle size={18} />
            <span>Chat</span>
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
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
