import { useQuery } from '@tanstack/react-query';
import type {
  MatStatsResponse,
  MuscleSummaryResponse,
  TopLiftsResponse,
  WeeklyStatsResponse,
} from '@app/shared';
import { apiGet } from '../lib/api';

/**
 * Muscle groups trained over `[since, until)` — both ends local ISO dates.
 *
 * `until` is exclusive and required by callers showing a bounded window: the
 * endpoint's filter was open-ended, so a session dated ahead of the window
 * counted as trained inside it.
 */
export function useMuscleSummary(since: string, until: string) {
  return useQuery<MuscleSummaryResponse, Error>({
    queryKey: ['stats', 'muscles', since, until],
    queryFn: () => apiGet<MuscleSummaryResponse>(`/stats/muscles?since=${since}&until=${until}`),
    staleTime: 5 * 60 * 1000,
  });
}

/** Top lifts by est. 1RM. `since` bounds the scan to the selected range. */
export function useTopLifts(since: string) {
  return useQuery<TopLiftsResponse, Error>({
    queryKey: ['stats', 'top-lifts', since],
    queryFn: () => apiGet<TopLiftsResponse>(`/stats/top-lifts?since=${since}`),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Per-week sessions, tonnage and set count. `since` = Monday of the oldest bucket.
 *
 * Server-side because the client-side equivalent read from `GET /sessions`,
 * which caps at 200 rows — fine at 8 weeks, silently short at a year.
 */
export function useWeeklyStats(since: string, weeks: number) {
  return useQuery<WeeklyStatsResponse, Error>({
    queryKey: ['stats', 'weekly', since, weeks],
    queryFn: () => apiGet<WeeklyStatsResponse>(`/stats/weekly?since=${since}&weeks=${weeks}`),
    staleTime: 5 * 60 * 1000,
  });
}

/** Weekly mat buckets + sparring aggregates. `since` = Monday of the oldest bucket. */
export function useMatStats(since: string, weeks = 8) {
  return useQuery<MatStatsResponse, Error>({
    queryKey: ['stats', 'mat', since, weeks],
    queryFn: () => apiGet<MatStatsResponse>(`/stats/mat?since=${since}&weeks=${weeks}`),
    staleTime: 5 * 60 * 1000,
  });
}
