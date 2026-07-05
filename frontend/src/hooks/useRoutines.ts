import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AddRoutineItemRequest,
  CreateFromTemplateResponse,
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
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
    },
  });
}

export function useCreateFromTemplate() {
  const queryClient = useQueryClient();

  return useMutation<CreateFromTemplateResponse, Error, { templateId: string }>({
    mutationFn: (body) => apiPost<CreateFromTemplateResponse>('/routines/from-template', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routines'] });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
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
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
    },
  });
}

export function useDeleteRoutine() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => apiDelete(`/routines/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routines'] });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
    },
  });
}

// Skip a single scheduled occurrence of a routine on a given date.
export function useSkipOccurrence() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id: string; date: string }>({
    mutationFn: ({ id, date }) => apiPost<void>(`/routines/${id}/skip`, { date }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
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
