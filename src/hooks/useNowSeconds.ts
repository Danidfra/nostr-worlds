import { useState, useEffect } from 'react';

/**
 * Hook that provides current unix timestamp and updates at a regular interval
 * 
 * This enables live updates for time-based game mechanics like plant growth
 * without causing excessive re-renders.
 * 
 * @param intervalMs - Update interval in milliseconds (default: 2000ms = 2 seconds)
 * @returns Current unix timestamp in seconds
 */
export function useNowSeconds(intervalMs: number = 2000): number {
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    // Update immediately on mount
    setNowSec(Math.floor(Date.now() / 1000));

    // Set up interval for live updates
    const interval = setInterval(() => {
      setNowSec(Math.floor(Date.now() / 1000));
    }, intervalMs);

    return () => clearInterval(interval);
  }, [intervalMs]);

  return nowSec;
}
