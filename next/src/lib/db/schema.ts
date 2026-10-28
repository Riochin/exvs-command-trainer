import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id:        text('id').primaryKey(),
  googleId:  text('google_id').notNull().unique(),
  name:      text('name').notNull(),
  email:     text('email').notNull(),
  avatarUrl: text('avatar_url'),
  createdAt: text('created_at').notNull(),
});

export const practiceSessions = sqliteTable(
  'practice_sessions',
  {
    id:                     text('id').primaryKey(),
    userId:                 text('user_id').references(() => users.id),
    clientId:               text('client_id').notNull(),
    commandId:              text('command_id').notNull(),
    commandSnapshot:        text('command_snapshot').notNull(),
    deviceType:             text('device_type').notNull(),
    startedAt:              text('started_at').notNull(),
    endedAt:                text('ended_at'),
    totalAttempts:          integer('total_attempts').notNull().default(0),
    successCount:           integer('success_count').notNull().default(0),
    durationMs:             integer('duration_ms'),
    abandoned:              integer('abandoned').notNull().default(0),
    timeLimitMs:            integer('time_limit_ms'),
    attemptsToFirstSuccess: integer('attempts_to_first_success'),
    bestAttemptMs:          integer('best_attempt_ms'),
  },
  (t) => [
    index('ps_client_id_idx').on(t.clientId),
    index('ps_user_id_idx').on(t.userId),
  ],
);

export const practiceAttempts = sqliteTable(
  'practice_attempts',
  {
    id:              text('id').primaryKey(),
    sessionId:       text('session_id').notNull().references(() => practiceSessions.id),
    userId:          text('user_id').references(() => users.id),
    clientId:        text('client_id').notNull(),
    commandId:       text('command_id').notNull(),
    attemptIndex:    integer('attempt_index').notNull(),
    success:         integer('success').notNull(),
    stepReached:     integer('step_reached').notNull(),
    failureStep:     integer('failure_step'),
    totalDurationMs: integer('total_duration_ms').notNull(),
    stepTimings:     text('step_timings').notNull(),
    inputSequence:   text('input_sequence'),
    createdAt:       text('created_at').notNull(),
  },
  (t) => [
    index('pa_session_id_idx').on(t.sessionId),
    index('pa_command_client_idx').on(t.commandId, t.clientId),
  ],
);

export const pageViews = sqliteTable(
  'page_views',
  {
    id:        text('id').primaryKey(),
    userId:    text('user_id').references(() => users.id),
    clientId:  text('client_id').notNull(),
    path:      text('path').notNull(),
    referrer:  text('referrer'),
    userAgent: text('user_agent'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('pv_client_id_idx').on(t.clientId),
  ],
);

export const events = sqliteTable(
  'events',
  {
    id:        text('id').primaryKey(),
    userId:    text('user_id').references(() => users.id),
    clientId:  text('client_id').notNull(),
    eventType: text('event_type').notNull(),
    payload:   text('payload'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('ev_client_event_idx').on(t.clientId, t.eventType),
  ],
);

/**
 * 入力リレー（試作）の WebRTC 接続情報の受け渡し場所。
 * 接続時に一度だけ使う一時データで、古い行は書き込みのついでに消す。
 */
export const relaySignals = sqliteTable(
  'relay_signals',
  {
    room:      text('room').primaryKey(),
    offer:     text('offer'),
    answer:    text('answer'),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    index('rs_updated_at_idx').on(t.updatedAt),
  ],
);
