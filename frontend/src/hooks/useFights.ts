import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateFightRequest,
  Fight,
  FightListResponse,
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

export function useCreateFight() {
  const queryClient = useQueryClient();
  return useMutation<Fight, Error, CreateFightRequest>({
    mutationFn: (body) =>
      apiPost<{ fight: Fight }>('/fights', body).then((r) => r.fight),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['fights', variables.disciplineId] });
    },
  });
}

export function useDeleteFight(disciplineId: string | null) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => apiDelete(`/fights/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fights', disciplineId] });
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
