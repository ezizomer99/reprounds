import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateDisciplineRequest,
  Discipline,
  DisciplineListResponse,
} from '@app/shared';
import { apiDelete, apiGet, apiPost } from '../lib/api';

export function useDisciplines() {
  return useQuery<Discipline[], Error>({
    queryKey: ['disciplines'],
    queryFn: async () => {
      const data = await apiGet<DisciplineListResponse>('/disciplines');
      return data.disciplines;
    },
  });
}

export function useCreateDiscipline() {
  const queryClient = useQueryClient();

  return useMutation<Discipline, Error, CreateDisciplineRequest>({
    mutationFn: (body) => apiPost<Discipline>('/disciplines', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disciplines'] });
    },
  });
}

export function useDeleteDiscipline() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => apiDelete(`/disciplines/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disciplines'] });
    },
  });
}
