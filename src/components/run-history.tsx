import { type PersistedRun } from '@/lib/types';

const statusClassName: Record<PersistedRun['status'], string> = {
  pending: 'border-zinc-300 bg-zinc-100 text-zinc-700',
  ongoing: 'border-blue-200 bg-blue-50 text-blue-700',
  completed: 'border-green-200 bg-green-50 text-green-700',
  failed: 'border-red-200 bg-red-50 text-red-700',
};

const formatTime = (value: string) =>
  new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

const formatElapsed = (run: PersistedRun) => {
  const start = new Date(run.startedAt).getTime();
  const end = run.completedAt
    ? new Date(run.completedAt).getTime()
    : Date.now();
  return `${((end - start) / 1000).toFixed(1)}s`;
};

export const RunHistory = ({ runs }: { runs: PersistedRun[] }) => {
  if (runs.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        No runs yet. Start a scenario to record status transitions.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {runs.slice(0, 5).map((run) => {
        const completedCount = run.steps.filter(
          (step) => step.status === 'completed'
        ).length;

        return (
          <li
            key={run.id}
            className="flex items-center justify-between gap-3 rounded-md border p-2 text-xs"
          >
            <div className="space-y-1">
              <p className="font-mono">{run.id}</p>
              <p className="text-muted-foreground">
                {formatTime(run.startedAt)} • {completedCount}/
                {run.steps.length} steps • {formatElapsed(run)}
              </p>
            </div>
            <span
              className={`inline-flex rounded-full border px-2 py-0.5 font-medium ${statusClassName[run.status]}`}
            >
              {run.status}
            </span>
          </li>
        );
      })}
    </ul>
  );
};
