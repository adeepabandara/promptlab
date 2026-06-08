'use client';

import { useEffect, useState } from 'react';

interface ElapsedTimerProps {
  startedAt: number; // ms timestamp
  className?: string;
}

export function ElapsedTimer({ startedAt, className = '' }: ElapsedTimerProps) {
  const [elapsed, setElapsed] = useState(Math.floor((Date.now() - startedAt) / 1000));

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  const display = m > 0 ? `${m}m ${s}s` : `${s}s`;

  return <span className={className}>{display}</span>;
}
