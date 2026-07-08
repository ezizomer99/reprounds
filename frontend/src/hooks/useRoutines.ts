import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AddRoutineItemRequest,
  CreateRoutineRequest,
  ReorderRoutineItemsRequest,
  RoutineItemWithDetails,
  RoutineListResponse,
  RoutineWithItems,
  UpdateRoutineItemRequest,
  UpdateRoutineRequest,
} from '@app/shared';
import { apiDelete, apiGet, apiPost, apiPatch, apiPut } from '../lib/api';

export function useRoutines() {
  return useQuery<RoutineWithItems[], Error>({
    queryKey: ['routines'],
    queryFn: async () => {
      const data = await apiGet<RoutineListResponse>('/routines');
      return data.routines;
    },
  });
}

export function useCreateRoutine() {
  const queryClient = useQueryClient();

  return useMutation<RoutineWithItems, Error, CreateRoutineRequest>({
    mutationFn: (body) => apiPost<RoutineWithItems>('/routines', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routines'] });
    },
  });
}

export function useUpdateRoutine() {
  const queryClient = useQueryClient();

  return useMutation<RoutineWithItems, Error, { id: string } & UpdateRoutineRequest>({
    mutationFn: ({ id, ...body }) =>
      apiPatch<RoutineWithItems>(`/routines/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routines'] });
    },
  });
}

export function useDeleteRoutine() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => apiDelete(`/routines/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routines'] });
    },
  });
}

export function useAddRoutineItem() {
  const queryClient = useQueryClient();

  return useMutation<RoutineWithItems, Error, { routineId: string } & AddRoutineItemRequest>({
    mutationFn: ({ routineId, ...body }) =>
      apiPost<RoutineWithItems>(`/routines/${routineId}/items`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routines'] });
    },
  });
}

export function useUpdateRoutineItem() {
  const queryClient = useQueryClient();

  return useMutation<RoutineItemWithDetails, Error, { routineId: string; itemId: string } & UpdateRoutineItemRequest>({
    mutationFn: ({ routineId, itemId, ...body }) =>
      apiPatch<RoutineItemWithDetails>(`/routines/${routineId}/items/${itemId}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routines'] });
    },
  });
}

export function useRemoveRoutineItem() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { routineId: string; itemId: string }>({
    mutationFn: ({ routineId, itemId }) =>
      apiDelete(`/routines/${routineId}/items/${itemId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routines'] });
    },
  });
}

export function useReorderRoutineItems() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { routineId: string } & ReorderRoutineItemsRequest>({
    mutationFn: ({ routineId, order }) =>
      apiPut<void>(`/routines/${routineId}/items/order`, { order }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routines'] });
    },
  });
}
