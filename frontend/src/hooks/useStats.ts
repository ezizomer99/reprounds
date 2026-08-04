import { useQuery } from '@tanstack/react-query';
import type { MatStatsResponse, MuscleSummaryResponse, TopLiftsResponse } from '@app/shared';
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

export function useTopLifts() {
  return useQuery<TopLiftsResponse, Error>({
    queryKey: ['stats', 'top-lifts'],
    queryFn: () => apiGet<TopLiftsResponse>('/stats/top-lifts'),
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
