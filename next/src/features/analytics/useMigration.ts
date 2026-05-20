'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import type { Command, PracticeLog } from '@/types';
import { postMigrate } from './apiClient';

export type MigrationStatus = 'idle' | 'pending' | 'done' | 'error';

export interface UseMigrationReturn {
  status: MigrationStatus;
}

const SYNCED_KEY = 'ct_synced_at';
const COMMANDS_KEY = 'ct_commands';
const LOGS_KEY = 'ct_practice_logs';

export function useMigration(): UseMigrationReturn {
  const { status: sessionStatus } = useSession();
  const [status, setStatus] = useState<MigrationStatus>('idle');

  useEffect(() => {
    if (sessionStatus !== 'authenticated') return;
    if (localStorage.getItem(SYNCED_KEY)) return;

    const run = async () => {
      setStatus('pending');

      const rawCommands = localStorage.getItem(COMMANDS_KEY);
      const rawLogs = localStorage.getItem(LOGS_KEY);
      const commands: Command[] = rawCommands ? (JSON.parse(rawCommands) as Command[]) : [];
      const practiceLogs: Record<string, PracticeLog> = rawLogs
        ? (JSON.parse(rawLogs) as Record<string, PracticeLog>)
        : {};

      try {
        const result = await postMigrate({ commands, practiceLogs });
        if (result === null) {
          setStatus('error');
          return;
        }
        localStorage.setItem(SYNCED_KEY, new Date().toISOString());
        setStatus('done');
      } catch {
        setStatus('error');
      }
    };

    void run();
  }, [sessionStatus]);

  return { status };
}
