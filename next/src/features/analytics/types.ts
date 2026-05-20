export interface StepFailureRate {
  step: number;
  failureCount: number;
  failureRate: number;
}

export interface CommandStat {
  commandId: string;
  commandName: string;
  totalAttempts: number;
  successCount: number;
  successRate: number;
  avgDurationMs: number;
  stepFailureRates: StepFailureRate[];
}

export interface DailyPractice {
  date: string;
  attemptCount: number;
}

export interface StatsResponse {
  commandStats: CommandStat[];
  dailyPractice: DailyPractice[];
}
