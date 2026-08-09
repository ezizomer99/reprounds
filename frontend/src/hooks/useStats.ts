import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type {
  MatStatsResponse,
  MuscleSummaryResponse,
  PersonalRecordsResponse,
  TopLiftsResponse,
  TrainingTotalsResponse,
  WeeklyStatsResponse,
  WeekStreakResponse,
} from '@app/shared';
import { addDaysISO } from '@app/shared';
import { apiGet } from '../lib/api';

/**
 * Shared options for every stats query on the tab.
 *
 * `keepPreviousData` is what stops the range selector blanking the page: the
 * window is part of every key, so 4W→8W→6M minted a fresh key with no data and
 * all six cards dropped to skeletons with jumping heights on the most-tapped
 * control on the screen. The previous window now stays up until the new one
 * arrives; callers dim on `isFetching`.
 */
const statsQueryOptions = {
  staleTime: 5 * 60 * 1000,
  placeholderData: keepPreviousData,
} as const;

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
    ...statsQueryOptions,
  });
}

/**
 * Top lifts by est. 1RM over `[since, until)`.
 *
 * `enabled` matters as much as the window: this is Pro-only content that a free
 * user only ever sees as a paywall blur, so fetching it for them was pure waste.
 * `proLoading` has to gate it too — a mid-race `isPro === false` is
 * indistinguishable from a genuine free user, and skipping the fetch on that
 * basis would leave a paying user staring at a permanent skeleton.
 */
export function useTopLifts(since: string, until: string, enabled = true) {
  return useQuery<TopLiftsResponse, Error>({
    queryKey: ['stats', 'top-lifts', since, until],
    queryFn: () => apiGet<TopLiftsResponse>(`/stats/top-lifts?since=${since}&until=${until}`),
    enabled,
    ...statsQueryOptions,
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
    ...statsQueryOptions,
  });
}

/** Lifts improved on within `[since, until)` — best estimate in the window vs. before it. */
export function usePersonalRecords(since: string, until: string, enabled = true) {
  return useQuery<PersonalRecordsResponse, Error>({
    queryKey: ['stats', 'prs', since, until],
    queryFn: () => apiGet<PersonalRecordsResponse>(`/stats/prs?since=${since}&until=${until}`),
    enabled,
    ...statsQueryOptions,
  });
}

/**
 * Consecutive trained weeks ending at the caller's current week.
 *
 * `today` is the device's local date and part of the key, so the streak
 * re-derives itself when the day rolls over — the local version read
 * `new Date()` inside a `useMemo` keyed on the session list, so an app left open
 * across Monday 00:00 kept showing last week's number.
 */
export function useWeekStreak(today: string, enabled = true) {
  return useQuery<WeekStreakResponse, Error>({
    queryKey: ['stats', 'streak', today],
    queryFn: () => apiGet<WeekStreakResponse>(`/stats/streak?today=${today}`),
    enabled,
    ...statsQueryOptions,
  });
}

/**
 * Lifetime training counts.
 *
 * `todayISO` is the device's local date; it's sent as an exclusive `until` of
 * tomorrow so today's sessions count and a session dated years ahead doesn't.
 * Pass the value from `useTodayISO` so the bound moves at local midnight.
 */
export function useTrainingTotals(todayISO: string) {
  return useQuery<TrainingTotalsResponse, Error>({
    queryKey: ['stats', 'totals', todayISO],
    queryFn: () =>
      apiGet<TrainingTotalsResponse>(`/stats/totals?until=${addDaysISO(todayISO, 1)}`),
    ...statsQueryOptions,
  });
}

/** Weekly mat buckets + sparring aggregates. `since` = Monday of the oldest bucket. */
export function useMatStats(since: string, weeks = 8) {
  return useQuery<MatStatsResponse, Error>({
    queryKey: ['stats', 'mat', since, weeks],
    queryFn: () => apiGet<MatStatsResponse>(`/stats/mat?since=${since}&weeks=${weeks}`),
    ...statsQueryOptions,
  });
}
