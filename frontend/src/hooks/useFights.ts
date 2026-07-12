import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateFightRequest,
  Fight,
  FightListResponse,
  FightRecord,
  FightRecordsResponse,
} from '@app/shared';
import { apiDelete, apiGet, apiPost } from '../lib/api';

export function useFights(disciplineId: string | null) {
  return useQuery<Fight[], Error>({
    queryKey: ['fights', disciplineId],
    queryFn: async () => {
      const data = await apiGet<FightListResponse>(`/fights?disciplineId=${disciplineId}`);
      return data.fights;
    },
    enabled: disciplineId !== null,
  });
}

// One request for every discipline's W-L-D, keyed by disciplineId — avoids the
// mat tab firing a separate /fights query per discipline card (an N+1).
//
// The queryFn returns the raw (JSON-serializable) response and `select` builds
// the Map. A Map must NOT be the cached query data: the offline persister
// JSON-stringifies the cache, and `JSON.stringify(new Map())` is `"{}"`, so a
// persisted-then-rehydrated Map comes back as a plain object and `.get(...)`
// throws, crashing the mat tab into the ErrorBoundary. `select` runs on the
// serializable cached data and is never persisted, so the Map is rebuilt fresh.
export function useFightRecords() {
  return useQuery<FightRecordsResponse, Error, Map<string, FightRecord>>({
    queryKey: ['fights', 'records'],
    queryFn: () => apiGet<FightRecordsResponse>('/fights/records'),
    select: (data) => new Map(data.records.map((r) => [r.disciplineId, r])),
  });
}

export function useCreateFight() {
  const queryClient = useQueryClient();
  return useMutation<Fight, Error, CreateFightRequest>({
    mutationFn: (body) =>
      apiPost<{ fight: Fight }>('/fights', body).then((r) => r.fight),
    onSuccess: () => {
      // Prefix-invalidate so both the per-discipline list and the records
      // aggregate (['fights', 'records']) refresh.
      queryClient.invalidateQueries({ queryKey: ['fights'] });
    },
  });
}

export function useDeleteFight(_disciplineId: string | null) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => apiDelete(`/fights/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fights'] });
    },
  });
}

/** Compute a W-L-D record from a list of fights. */
export function fightRecord(fights: Fight[]): { wins: number; losses: number; draws: number } {
  return fights.reduce(
    (acc, f) => {
      if (f.result === 'win') acc.wins += 1;
      else if (f.result === 'loss') acc.losses += 1;
      else acc.draws += 1;
      return acc;
    },
    { wins: 0, losses: 0, draws: 0 },
  );
}
