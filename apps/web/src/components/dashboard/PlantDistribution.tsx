import Link from 'next/link';
import { Button } from '../ui/Button';
import { SectionHeader } from '../ui/SectionHeader';

type Props = {
  online: number;
  offline: number;
  maintenance: number;
  plants: Array<{
    id: string;
    name: string;
    operationalStatus: string;
    latitude: number | null;
    longitude: number | null;
  }>;
};

export function PlantDistribution({ online, offline, maintenance, plants }: Props) {
  const counted = online + offline + maintenance;
  const total = Math.max(counted, 1);
  const geoReady = plants.some((plant) => plant.latitude !== null && plant.longitude !== null);

  return (
    <section className="dashboard-panel">
      <SectionHeader
        title="Distribuição das usinas"
        description={geoReady ? 'Coordenadas disponíveis para mapa futuro.' : 'Representação operacional sem mapa geográfico.'}
        actions={(
          <Link href="/usinas">
            <Button variant="secondary">Ver todas</Button>
          </Link>
        )}
      />
      <div className="status-rings" aria-label="Resumo operacional das usinas">
        <div className="status-ring success"><strong>{online}</strong><span>Online</span></div>
        <div className="status-ring danger"><strong>{offline}</strong><span>Offline</span></div>
        <div className="status-ring neutral"><strong>{maintenance}</strong><span>Manutenção</span></div>
      </div>
      <div className="distribution-bars">
        <DistributionRow label="Online" value={online} total={total} tone="success" />
        <DistributionRow label="Offline" value={offline} total={total} tone="danger" />
        <DistributionRow label="Em manutenção" value={maintenance} total={total} tone="neutral" />
      </div>
    </section>
  );
}

function DistributionRow({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: string;
}) {
  const widthPercent = `${(value / total) * 100}%`;
  return (
    <div className="distribution-row">
      <div>
        <strong>{label}</strong>
        <span>{value}</span>
      </div>
      <div className="distribution-track" role="presentation">
        <i className={`tone-${tone}`} style={{ width: widthPercent }} />
      </div>
    </div>
  );
}
