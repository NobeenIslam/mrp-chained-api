import { type Job } from '@/lib/types';
import { StatusIcon } from '@/components/status-icon';

const formatMs = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

export const JobList = ({ jobs }: { jobs: Job[] }) => {
  return (
    <ul className="space-y-2">
      {jobs.map((job) => (
        <li key={job.step} className="flex items-center gap-3 text-sm">
          <StatusIcon status={job.status} />
          <span className="font-mono">Job {job.step}</span>
          {job.durationMs !== undefined && (
            <span className="text-muted-foreground ml-auto">
              {formatMs(job.durationMs)}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
};
