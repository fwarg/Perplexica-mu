'use client';

import { useEffect, useState } from 'react';

type GpuStatus = {
  enabled: boolean;
  available?: boolean;
  usage?: number | null;
  type?: 'amd' | 'nvidia';
};

/**
 * Returns the appropriate color class based on GPU usage percentage.
 * Green: <10%, Yellow: 10-50%, Red: >50%
 */
function getStatusColor(usage: number): string {
  if (usage < 10) return 'bg-green-500';
  if (usage <= 50) return 'bg-yellow-500';
  return 'bg-red-500';
}

function getStatusLabel(usage: number): string {
  if (usage < 10) return 'Low';
  if (usage <= 50) return 'Medium';
  return 'High';
}

const GPUIndicator = () => {
  const [status, setStatus] = useState<GpuStatus | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/system/gpu');
        if (res.ok) {
          const data = await res.json();
          setStatus(data);
        }
      } catch {
        // Silently fail - indicator just won't show
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);

    return () => clearInterval(interval);
  }, []);

  // Don't render if not enabled or not available
  if (!status?.enabled || !status?.available || status?.usage === null) {
    return null;
  }

  const usage = status.usage ?? 0;
  const gpuType = status.type?.toUpperCase() || 'GPU';

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg"
      title={`${gpuType} Usage: ${usage}% (${getStatusLabel(usage)})`}
    >
      <div
        className={`w-2.5 h-2.5 rounded-full ${getStatusColor(usage)} shadow-sm`}
      />
      <span className="text-xs text-black/50 dark:text-white/50 hidden sm:inline">
        GPU
      </span>
    </div>
  );
};

export default GPUIndicator;
