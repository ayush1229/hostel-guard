import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import GuardLayout from './guard/GuardLayout';
import Dashboard from './guard/Dashboard';
import GateLogs from './guard/GateLogs';
import DayScholar from './guard/DayScholar';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path='/' element={<GuardLayout />}>
          <Route index element={<Dashboard />} />
          <Route path='dashboard' element={<Dashboard />} />
          <Route path='logs' element={<GateLogs />} />
          <Route path='dayscholar' element={<DayScholar />} />
        </Route>
        <Route path='*' element={<Navigate to='/' replace />} />
      </Routes>
    </Router>
  );
}

export default App;