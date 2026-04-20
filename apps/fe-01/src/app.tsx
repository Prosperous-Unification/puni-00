import { D3Smoke } from '@/components/smoke/d3-smoke';
import { TableSmoke } from '@/components/smoke/table-smoke';
import { Button } from '@/components/ui/button';

export function App() {
  return (
    <main style={{ padding: 32, fontFamily: 'sans-serif' }}>
      <h1>WBS Tool</h1>
      <Button>Smoke test</Button>
      <section style={{ marginTop: 24 }}>
        <h2>Table</h2>
        <TableSmoke />
      </section>
      <section style={{ marginTop: 24 }}>
        <h2>d3</h2>
        <D3Smoke />
      </section>
    </main>
  );
}
