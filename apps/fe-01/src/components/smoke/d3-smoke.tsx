import { scaleLinear } from 'd3-scale';
import { useEffect, useRef } from 'react';

export function D3Smoke() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const scale = scaleLinear().domain([0, 10]).range([0, 100]);
    ref.current.textContent = `scale(5) = ${String(scale(5))}`;
  }, []);
  return <div ref={ref} />;
}
