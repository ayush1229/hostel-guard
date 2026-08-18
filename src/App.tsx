import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import GuardLayout from './guard/GuardLayout';
import Dashboard from './guard/Dashboard';
import BarcodeScanner from './guard/BarcodeScanner';
import GateLogs from './guard/GateLogs';
import DayScholar from './guard/DayScholar';
import HostelDashboard from './guard/HostelDashboard';
import HostelLogs from './guard/HostelLogs';
import DeviceGatekeeper from './guard/verification/DeviceGatekeeper';
import './App.css';

/** Redirect root '/' to the correct default page based on guard type */
function RootRedirect() {
  const guardType = localStorage.getItem('guard_type') || 'MAIN_GATE';
  return <Navigate to={guardType === 'HOSTEL_GATE' ? '/hostel-dashboard' : '/dashboard'} replace />;
}

function MainGateRoute({ element }: { element: React.ReactElement }) {
  const guardType = localStorage.getItem('guard_type') || 'MAIN_GATE';
  if (guardType === 'HOSTEL_GATE') {
    return <Navigate to="/hostel-dashboard" replace />;
  }
  return element;
}

function HostelGateRoute({ element }: { element: React.ReactElement }) {
  const guardType = localStorage.getItem('guard_type') || 'MAIN_GATE';
  if (guardType !== 'HOSTEL_GATE') {
    return <Navigate to="/dashboard" replace />;
  }
  return element;
}

function App() {
  return (
    <Router>
      <DeviceGatekeeper>
        <Routes>
          <Route path='/' element={<GuardLayout />}>
            {/* Smart default redirect */}
            <Route index element={<RootRedirect />} />

            {/* Main Gate routes */}
            <Route path='scan' element={<MainGateRoute element={<BarcodeScanner />} />} />
            <Route path='dashboard' element={<MainGateRoute element={<Dashboard />} />} />
            <Route path='logs' element={<MainGateRoute element={<GateLogs />} />} />
            <Route path='dayscholar' element={<MainGateRoute element={<DayScholar />} />} />

            {/* Hostel Gate routes */}
            <Route path='hostel-dashboard' element={<HostelGateRoute element={<HostelDashboard />} />} />
            <Route path='hostel-logs' element={<HostelGateRoute element={<HostelLogs />} />} />
          </Route>
          <Route path='*' element={<Navigate to='/' replace />} />
        </Routes>
      </DeviceGatekeeper>
    </Router>
  );
}

export default App;