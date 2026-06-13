import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ActivityType,
  CreateExerciseRequest,
  Exercise,
  ExerciseListResponse,
  UpdateExerciseRequest,
} from '@app/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from '../lib/api';

interface UseExercisesParams {
  type?: Exclude<ActivityType, 'martial_arts'>;
  search?: string;
}

export function useExercises(params: UseExercisesParams = {}) {
  const { type, search } = params;

  return useQuery<Exercise[], Error>({
    queryKey: ['exercises', { type, search }],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (type) qs.set('type', type);
      if (search) qs.set('search', search);
      const query = qs.toString();
      const data = await apiGet<ExerciseListResponse>(
        `/exercises${query ? `?${query}` : ''}`,
      );
      return data.exercises;
    },
  });
}

export function useCreateExercise() {
  const queryClient = useQueryClient();

  return useMutation<Exercise, Error, CreateExerciseRequest>({
    mutationFn: (body) =>
      apiPost<Exercise>('/exercises', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercises'] });
    },
  });
}

export function useUpdateExercise() {
  const queryClient = useQueryClient();

  return useMutation<
    Exercise,
    Error,
    { id: string } & UpdateExerciseRequest
  >({
    mutationFn: ({ id, ...body }) =>
      apiPatch<Exercise>(`/exercises/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercises'] });
    },
  });
}

export function useDeleteExercise() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => apiDelete(`/exercises/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercises'] });
    },
  });
}
