import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ActivityType,
  CreateExerciseRequest,
  Exercise,
  ExerciseListResponse,
  SetExerciseMusclesRequest,
  UpdateExerciseRequest,
} from '@app/shared';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '../lib/api';
import { useDebouncedValue } from './useDebouncedValue';

interface UseExercisesParams {
  type?: Exclude<ActivityType, 'martial_arts'>;
  search?: string;
  category?: string;
  equipment?: string;
}

export function useExercises(params: UseExercisesParams = {}) {
  const { type, search, category, equipment } = params;
  // Debounce the search term so typing doesn't fire a request per keystroke.
  const debouncedSearch = useDebouncedValue(search, 250);

  return useQuery<Exercise[], Error>({
    queryKey: ['exercises', { type, search: debouncedSearch, category, equipment }],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (type) qs.set('type', type);
      if (debouncedSearch) qs.set('search', debouncedSearch);
      if (category) qs.set('category', category);
      if (equipment) qs.set('equipment', equipment);
      const query = qs.toString();
      const data = await apiGet<ExerciseListResponse>(
        `/exercises${query ? `?${query}` : ''}`,
      );
      return data.exercises;
    },
  });
}

export function useExercise(id: string | null) {
  return useQuery<Exercise, Error>({
    queryKey: ['exercise', id],
    queryFn: async () => {
      const data = await apiGet<{ exercise: Exercise }>(`/exercises/${id}`);
      return data.exercise;
    },
    enabled: !!id,
  });
}

export function useCreateExercise() {
  const queryClient = useQueryClient();

  return useMutation<Exercise, Error, CreateExerciseRequest>({
    mutationFn: async (body) => {
      const data = await apiPost<{ exercise: Exercise }>('/exercises', body);
      return data.exercise;
    },
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
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['exercises'] });
      queryClient.invalidateQueries({ queryKey: ['exercise', variables.id] });
    },
  });
}

/**
 * Invalidations shared by both muscle mutations. `stats` is in there because the
 * muscle heat map is server-aggregated: without it, re-tagging an exercise
 * leaves the map showing the old muscles until the next cold fetch.
 */
function invalidateMuscles(queryClient: ReturnType<typeof useQueryClient>, id: string) {
  queryClient.invalidateQueries({ queryKey: ['exercises'] });
  queryClient.invalidateQueries({ queryKey: ['exercise', id] });
  queryClient.invalidateQueries({ queryKey: ['stats'] });
}

/**
 * Replace an exercise's muscle tagging. Works on any exercise the user can see:
 * the server updates their own row in place, and stores a per-user override for
 * a seeded one rather than editing a row every user shares.
 */
export function useSetExerciseMuscles() {
  const queryClient = useQueryClient();

  return useMutation<Exercise, Error, { id: string } & SetExerciseMusclesRequest>({
    mutationFn: async ({ id, ...body }) => {
      const data = await apiPut<{ exercise: Exercise }>(`/exercises/${id}/muscles`, body);
      return data.exercise;
    },
    onSuccess: (_data, { id }) => invalidateMuscles(queryClient, id),
  });
}

/** Drop a per-user override, restoring the seeded catalogue's tagging. */
export function useResetExerciseMuscles() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => apiDelete(`/exercises/${id}/muscles`),
    onSuccess: (_data, id) => invalidateMuscles(queryClient, id),
  });
}

export function useDeleteExercise() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => apiDelete(`/exercises/${id}`),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['exercises'] });
      queryClient.invalidateQueries({ queryKey: ['exercise', id] });
    },
  });
}
