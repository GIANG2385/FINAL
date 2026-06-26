import { Routes, Route } from 'react-router-dom'
import AppShell from './components/AppShell'
import ProtectedRoute from './components/ProtectedRoute'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import FrontOfHouse from './pages/FrontOfHouse'
import BackOfHouse from './pages/BackOfHouse'
import Insights from './pages/Insights'
import GuestEngagement from './pages/GuestEngagement'
import Consultant from './pages/Consultant'
import VnpayReturn from './pages/VnpayReturn'

export default function App() {
  return (
    <Routes>
      {/* Standalone pages — no sidebar */}
      <Route path="/login" element={<Login />} />
      <Route path="/vnpay-return" element={<VnpayReturn />} />

      {/* Shell-wrapped pages */}
      <Route element={<AppShell />}>
        <Route path="/" element={<ProtectedRoute allowedRoles={['manager', 'admin']}><Dashboard /></ProtectedRoute>} />
        <Route path="/foh" element={<ProtectedRoute><FrontOfHouse /></ProtectedRoute>} />
        <Route path="/boh" element={<ProtectedRoute><BackOfHouse /></ProtectedRoute>} />
        <Route path="/guests" element={<ProtectedRoute><GuestEngagement /></ProtectedRoute>} />
        <Route path="/insights" element={<ProtectedRoute><Insights /></ProtectedRoute>} />
        <Route path="/consultant" element={<ProtectedRoute allowedRoles={['manager', 'admin']}><Consultant /></ProtectedRoute>} />
      </Route>
    </Routes>
  )
}
