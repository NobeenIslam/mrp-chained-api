import { type JobStatus } from '@/lib/types';

export const StatusIcon = ({ status }: { status: JobStatus }) => {
  switch (status) {
    case 'idle':
      return (
        <span className="text-muted-foreground inline-block size-5 text-center">
          -
        </span>
      );
    case 'running':
      return (
        <span className="inline-block size-5 animate-spin text-center text-blue-500">
          &#9696;
        </span>
      );
    case 'complete':
      return (
        <span className="inline-block size-5 text-center text-green-500">
          &#10003;
        </span>
      );
    case 'failed':
      return (
        <span className="inline-block size-5 text-center text-red-500">
          &#10007;
        </span>
      );
    case 'timeout':
      return (
        <span className="inline-block size-5 text-center text-amber-500">
          &#9888;
        </span>
      );
  }
};
