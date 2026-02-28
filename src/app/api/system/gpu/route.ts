import { NextResponse } from 'next/server';
import fs from 'fs';
import { execSync } from 'child_process';
import configManager from '@/lib/config';

const SYSFS_DRM_PATH = '/sys/class/drm';

/**
 * Reads GPU utilization from Linux sysfs (AMD GPUs).
 * Looks for gpu_busy_percent in /sys/class/drm/card[N]/device/
 */
function getAmdGpuUsage(): number | null {
  try {
    if (!fs.existsSync(SYSFS_DRM_PATH)) {
      return null;
    }

    const cards = fs.readdirSync(SYSFS_DRM_PATH).filter((f) => {
      // Match card0, card1, etc. but not card0-DP-1 (connector entries)
      return /^card\d+$/.test(f);
    });

    for (const card of cards) {
      const busyPath = `${SYSFS_DRM_PATH}/${card}/device/gpu_busy_percent`;
      if (fs.existsSync(busyPath)) {
        const value = fs.readFileSync(busyPath, 'utf8').trim();
        const usage = parseInt(value, 10);
        if (!isNaN(usage)) {
          return usage;
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Reads GPU utilization using nvidia-smi (NVIDIA GPUs).
 */
function getNvidiaGpuUsage(): number | null {
  try {
    const output = execSync(
      'nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits',
      { encoding: 'utf8', timeout: 5000 },
    ).trim();

    // If multiple GPUs, take the first one
    const firstLine = output.split('\n')[0];
    const usage = parseInt(firstLine, 10);

    if (!isNaN(usage)) {
      return usage;
    }

    return null;
  } catch {
    return null;
  }
}

export const GET = async () => {
  const gpuType = configManager.getConfig('system.gpuIndicatorType', 'disabled');

  if (gpuType === 'disabled') {
    return NextResponse.json({ enabled: false });
  }

  let usage: number | null = null;

  if (gpuType === 'amd') {
    usage = getAmdGpuUsage();
  } else if (gpuType === 'nvidia') {
    usage = getNvidiaGpuUsage();
  }

  return NextResponse.json({
    enabled: true,
    available: usage !== null,
    usage,
    type: gpuType,
  });
};
