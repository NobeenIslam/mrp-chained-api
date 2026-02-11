import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { type ScenarioState } from '@/lib/types';
import { StatusBadge } from '@/components/status-badge';
import { JobList } from '@/components/job-list';

const formatMs = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

type ScenarioCardProps = {
  title: string;
  description: string;
  details: string;
  expectedOutcome: string;
  onRun: () => void;
  state: ScenarioState;
};

export const ScenarioCard = ({
  title,
  description,
  details,
  expectedOutcome,
  onRun,
  state,
}: ScenarioCardProps) => {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <CardTitle>{title}</CardTitle>
          <StatusBadge status={state.status} />
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-xs">{details}</p>
        <div className="rounded-md border p-3">
          <JobList jobs={state.jobs} />
        </div>
        {state.elapsed > 0 && (
          <p className="text-muted-foreground text-xs">
            Elapsed: {formatMs(state.elapsed)}
          </p>
        )}
        {state.error && (
          <p className="rounded-md bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
            {state.error}
          </p>
        )}
        <p className="text-muted-foreground text-xs italic">
          Expected: {expectedOutcome}
        </p>
        <Button
          onClick={onRun}
          disabled={state.status === 'running'}
          className="w-full"
        >
          {state.status === 'running' ? 'Running...' : 'Run'}
        </Button>
      </CardContent>
    </Card>
  );
};
