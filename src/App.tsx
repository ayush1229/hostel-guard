import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import GuardLayout from './guard/GuardLayout';
import Dashboard from './guard/Dashboard';
import BarcodeScanner from './guard/BarcodeScanner';
import GateLogs from './guard/GateLogs';
import DayScholar from './guard/DayScholar';
import DeviceGatekeeper from './guard/verification/DeviceGatekeeper';
import './App.css';

function App() {
  return (
    <Router>
      <DeviceGatekeeper>
        <Routes>
          <Route path='/' element={<GuardLayout />}>
            <Route index element={<Dashboard />} />
            <Route path='scan' element={<BarcodeScanner />} />
            <Route path='dashboard' element={<Dashboard />} />
            <Route path='logs' element={<GateLogs />} />
            <Route path='dayscholar' element={<DayScholar />} />
          </Route>
          <Route path='*' element={<Navigate to='/' replace />} />
        </Routes>
      </DeviceGatekeeper>
    </Router>
  );
}

export default App;