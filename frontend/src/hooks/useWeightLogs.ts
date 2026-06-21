import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateWeightLogRequest,
  WeightLog,
  WeightLogListResponse,
} from '@app/shared';
import { apiDelete, apiGet, apiPost } from '../lib/api';

export function useWeightLogs() {
  return useQuery<WeightLog[], Error>({
    queryKey: ['weights'],
    queryFn: async () => {
      const data = await apiGet<WeightLogListResponse>('/weights');
      return data.weights;
    },
  });
}

export function useCreateWeightLog() {
  const queryClient = useQueryClient();
  return useMutation<WeightLog, Error, CreateWeightLogRequest>({
    mutationFn: (body) =>
      apiPost<{ weight: WeightLog }>('/weights', body).then((r) => r.weight),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weights'] });
    },
  });
}

export function useDeleteWeightLog() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => apiDelete(`/weights/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weights'] });
    },
  });
}
