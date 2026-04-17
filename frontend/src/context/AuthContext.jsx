import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('tellem_token'))
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('tellem_user')
    return saved ? JSON.parse(saved) : null
  })

  function login(tokenStr, userData) {
    setToken(tokenStr)
    setUser(userData)
    localStorage.setItem('tellem_token', tokenStr)
    localStorage.setItem('tellem_user', JSON.stringify(userData))
  }

  function logout() {
    setToken(null)
    setUser(null)
    localStorage.removeItem('tellem_token')
    localStorage.removeItem('tellem_user')
  }

  return (
    <AuthContext.Provider value={{ token, user, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
