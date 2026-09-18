type Point = { label: string; valueKwh: number };

type Props = {
  points: Point[];
};

export function GenerationChart({ points }: Props) {
  if (!points.length) {
    return (
      <div className="empty compact">
        <div className="empty-icon" aria-hidden="true">☀</div>
        <h3>Sem dados</h3>
        <p>Não há leituras de geração para o período selecionado.</p>
      </div>
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
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Gráfico de geração de energia">
        <defs>
          <linearGradient id="b7-gen-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padding + innerHeight * ratio;
          return <line key={ratio} x1={padding} x2={width - padding} y1={y} y2={y} stroke="rgba(148,163,184,.18)" strokeWidth="1" />;
        })}
        <polygon fill="url(#b7-gen-fill)" points={area} />
        <polyline fill="none" stroke="#4ade80" strokeWidth="3" strokeLinejoin="round" points={line} />
        {coords.map((item, index) => (
          <circle key={`${item.point.label}-${index}`} cx={item.x} cy={item.y} r="4" fill="#60a5fa">
            <title>{`${item.point.label}: ${item.point.valueKwh}`}</title>
          </circle>
        ))}
      </svg>
      <div className="chart-labels">
        {points.map((point) => (
          <span key={point.label}>{point.label}</span>
        ))}
      </div>
    </div>
  );
}
