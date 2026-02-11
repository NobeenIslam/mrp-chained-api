import { Badge } from '@/components/ui/badge';
import { type ScenarioStatus } from '@/lib/types';

export const StatusBadge = ({ status }: { status: ScenarioStatus }) => {
  switch (status) {
    case 'idle':
      return <Badge variant="outline">Idle</Badge>;
    case 'running':
      return <Badge variant="secondary">Running</Badge>;
    case 'complete':
      return <Badge className="bg-green-600">Complete</Badge>;
    case 'error':
      return <Badge variant="destructive">Error</Badge>;
  }
};
