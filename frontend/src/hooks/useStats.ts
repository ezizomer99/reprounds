import { useQuery } from '@tanstack/react-query';
import type { MatStatsResponse, MuscleSummaryResponse, TopLiftsResponse } from '@app/shared';
import { apiGet } from '../lib/api';

export function useMuscleSummary(since: string) {
  return useQuery<MuscleSummaryResponse, Error>({
    queryKey: ['stats', 'muscles', since],
    queryFn: () => apiGet<MuscleSummaryResponse>(`/stats/muscles?since=${since}`),
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
