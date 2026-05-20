import { describe, it, expect } from 'vitest';
import { getTableName } from 'drizzle-orm';
import {
  users,
  practiceSessions,
  practiceAttempts,
  pageViews,
  events,
} from '@/lib/db/schema';

describe('Drizzle スキーマ定義', () => {
  describe('users テーブル', () => {
    it('テーブル名が users である', () => {
      expect(getTableName(users)).toBe('users');
    });

    it('必要なカラムが全て定義されている', () => {
      const columns = Object.keys(users);
      expect(columns).toContain('id');
      expect(columns).toContain('googleId');
      expect(columns).toContain('name');
      expect(columns).toContain('email');
      expect(columns).toContain('avatarUrl');
      expect(columns).toContain('createdAt');
    });
  });

  describe('practiceSessions テーブル', () => {
    it('テーブル名が practice_sessions である', () => {
      expect(getTableName(practiceSessions)).toBe('practice_sessions');
    });

    it('セッション集計カラムが定義されている', () => {
      const columns = Object.keys(practiceSessions);
      expect(columns).toContain('id');
      expect(columns).toContain('userId');
      expect(columns).toContain('clientId');
      expect(columns).toContain('commandId');
      expect(columns).toContain('commandSnapshot');
      expect(columns).toContain('deviceType');
      expect(columns).toContain('startedAt');
      expect(columns).toContain('totalAttempts');
      expect(columns).toContain('successCount');
      expect(columns).toContain('abandoned');
      expect(columns).toContain('attemptsToFirstSuccess');
      expect(columns).toContain('bestAttemptMs');
    });
  });

  describe('practiceAttempts テーブル', () => {
    it('テーブル名が practice_attempts である', () => {
      expect(getTableName(practiceAttempts)).toBe('practice_attempts');
    });

    it('試行詳細カラムが定義されている', () => {
      const columns = Object.keys(practiceAttempts);
      expect(columns).toContain('sessionId');
      expect(columns).toContain('success');
      expect(columns).toContain('stepReached');
      expect(columns).toContain('stepTimings');
      expect(columns).toContain('inputSequence');
      expect(columns).toContain('totalDurationMs');
      expect(columns).toContain('attemptIndex');
    });
  });

  describe('pageViews テーブル', () => {
    it('テーブル名が page_views である', () => {
      expect(getTableName(pageViews)).toBe('page_views');
    });

    it('ページビューカラムが定義されている', () => {
      const columns = Object.keys(pageViews);
      expect(columns).toContain('path');
      expect(columns).toContain('referrer');
      expect(columns).toContain('userAgent');
      expect(columns).toContain('clientId');
    });
  });

  describe('events テーブル', () => {
    it('テーブル名が events である', () => {
      expect(getTableName(events)).toBe('events');
    });

    it('イベントカラムが定義されている', () => {
      const columns = Object.keys(events);
      expect(columns).toContain('eventType');
      expect(columns).toContain('payload');
      expect(columns).toContain('clientId');
    });
  });
});
