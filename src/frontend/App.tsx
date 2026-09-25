import { useEffect, useState } from 'preact/hooks';

export function App() {
  const [health, setHealth] = useState<string>('checking...');

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((data) => setHealth(data.status))
      .catch(() => setHealth('unreachable'));
  }, []);

  return (
    <div class="card">
      <h1>Weekly Load Planner</h1>
      <p class="muted">Scaffold placeholder. API health: {health}</p>
    </div>
  );
}
