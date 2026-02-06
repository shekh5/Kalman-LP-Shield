import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Pools } from './pages/Pools';
import { Analytics } from './pages/Analytics';
import { Settings } from './pages/Settings';
import { Agents } from './pages/Agents';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="pools" element={<Pools />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="agents" element={<Agents />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}

export default App;
