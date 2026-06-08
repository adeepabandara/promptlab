import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const statusConfig = {
  pending: { label: 'Pending', className: 'bg-gray-100 text-gray-700' },
  running: { label: 'Running', className: 'bg-blue-100 text-blue-700' },
  completed: { label: 'Completed', className: 'bg-green-100 text-green-700' },
  failed: { label: 'Failed', className: 'bg-red-100 text-red-700' },
};

export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status as keyof typeof statusConfig] ?? statusConfig.pending;
  return (
    <Badge className={cn('font-medium border-0', config.className)}>
      {config.label}
    </Badge>
  );
}
