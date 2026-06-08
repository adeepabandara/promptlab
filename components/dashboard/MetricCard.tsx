import { Card, CardContent } from '@/components/ui/card';

interface MetricCardProps {
  label: string;
  value: string;
  sub?: string;
}

export function MetricCard({ label, value, sub }: MetricCardProps) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">{label}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}
