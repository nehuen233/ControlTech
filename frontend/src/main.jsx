import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './AuthContext.jsx'
import { AlertasProvider } from './components/Alertas.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <AlertasProvider>
        <App />
      </AlertasProvider>
    </AuthProvider>
  </StrictMode>,
)
