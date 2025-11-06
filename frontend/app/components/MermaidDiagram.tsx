'use client';

import mermaid from 'mermaid';
import React from 'react';

interface MermaidDiagramProps {
  chart: string;
}

mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' });

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const [svg, setSvg] = React.useState<string>('');
  const idRef = React.useRef(`mermaid-${Math.random().toString(36).slice(2)}`);

  React.useEffect(() => {
    let cancelled = false;
    async function render() {
      try {
        const { svg: rendered } = await mermaid.render(idRef.current, chart);
        if (!cancelled) {
          setSvg(rendered);
        }
      } catch (error) {
        if (!cancelled) {
          setSvg(`<pre>${String(error)}</pre>`);
        }
      }
    }
    render();
    return () => {
      cancelled = true;
    };
  }, [chart]);

  return (
    <div
      className="mermaid-diagram"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
