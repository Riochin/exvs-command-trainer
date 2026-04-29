export type ButtonType = 'shot' | 'melee' | 'jump' | 'awaken';

export type CommandStep = {
  buttons: ButtonType[];
};

export type Command = {
  id: string;
  mobileSuit: string;
  name: string;
  sequence: CommandStep[];
  createdAt: string;
};

export type PracticeAttempt = {
  success: boolean;
  timestamp: string;
};

export type PracticeLog = {
  commandId: string;
  attempts: PracticeAttempt[];
};

export type PracticeSessionStatus = 'idle' | 'active' | 'completed';

export type PracticeSessionState = {
  status: PracticeSessionStatus;
  command: Command | null;
  currentIndex: number;
  attempts: PracticeAttempt[];
  lastResult: 'success' | 'failure' | null;
};

export type StorageError = {
  type: 'quota_exceeded' | 'parse_error' | 'write_error';
  message: string;
};

export type StorageResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: StorageError };
