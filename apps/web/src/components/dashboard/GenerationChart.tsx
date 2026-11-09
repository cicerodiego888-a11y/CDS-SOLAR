import { EmptyState } from '../ui/EmptyState';

type Point = { label: string; valueKwh: number };

type Props = {
  points: Point[];
};

export function GenerationChart({ points }: Props) {
  if (!points.length) {
    return (
      <EmptyState
        title="Sem dados de geração"
        description="Não há leituras disponíveis para o período selecionado."
        icon="☀"
      />
    );
  }

  const width = 640;
  const height = 220;
  const padding = 28;
  const max = Math.max(...points.map((point) => point.valueKwh), 0);
  const chartMax = max === 0 ? 1 : max;
  const step = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0;
  const innerHeight = height - padding * 2;

  const coords = points.map((point, index) => {
    const x = padding + index * step;
    const y = height - padding - (point.valueKwh / chartMax) * innerHeight;
    return { x, y, point };
  });
  const line = coords.map((item) => `${item.x},${item.y}`).join(' ');
  const area = `${padding},${height - padding} ${line} ${coords[coords.length - 1]?.x ?? padding},${height - padding}`;

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Gráfico de geração de energia em kWh">
        <defs>
          <linearGradient id="b7-gen-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-brand-energy)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--color-brand-energy)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padding + innerHeight * ratio;
          return (
            <line
              key={ratio}
              x1={padding}
              x2={width - padding}
              y1={y}
              y2={y}
              stroke="var(--color-border)"
              strokeWidth="1"
            />
          );
        })}
        <polygon fill="url(#b7-gen-fill)" points={area} />
        <polyline
          fill="none"
          stroke="var(--color-brand-energy-bright)"
          strokeWidth="3"
          strokeLinejoin="round"
          points={line}
        />
        {coords.map((item, index) => (
          <circle
            key={`${item.point.label}-${index}`}
            cx={item.x}
            cy={item.y}
            r="4"
            fill="var(--color-brand-accent-strong)"
          >
            <title>{`${item.point.label}: ${item.point.valueKwh} kWh`}</title>
          </circle>
        ))}
      </svg>
      <div className="chart-labels" aria-hidden="true">
        {points.map((point) => (
          <span key={point.label}>{point.label}</span>
        ))}
      </div>
    </div>
  );
}
