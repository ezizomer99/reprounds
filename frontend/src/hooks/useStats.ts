import { useQuery } from '@tanstack/react-query';
import type { MuscleSummaryResponse, TopLiftsResponse } from '@app/shared';
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
