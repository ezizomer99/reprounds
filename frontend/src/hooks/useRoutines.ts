import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AddRoutineItemRequest,
  CreateRoutineRequest,
  ReorderRoutineItemsRequest,
  ReorderRoutinesRequest,
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

const ROUTINES_KEY = ['routines'] as const;

type RoutinesCtx = { previous?: RoutineWithItems[] };

// Reorders `list` to match `order`, appending anything added since the drag
// started so a concurrent insert can't be dropped from the cache.
function applyOrder<T extends { id: string }>(list: T[], order: string[]): T[] {
  const byId = new Map(list.map((entry) => [entry.id, entry]));
  const reordered = order
    .map((id) => byId.get(id))
    .filter((entry): entry is T => entry !== undefined);
  const missing = list.filter((entry) => !order.includes(entry.id));
  return [...reordered, ...missing];
}

export function useReorderRoutineItems() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { routineId: string } & ReorderRoutineItemsRequest, RoutinesCtx>({
    mutationFn: ({ routineId, order }) =>
      apiPut<void>(`/routines/${routineId}/items/order`, { order }),
    // Without this the list re-renders from the stale cache the moment the row
    // is dropped, so the drag visibly snaps back until the refetch lands.
    onMutate: async ({ routineId, order }) => {
      await queryClient.cancelQueries({ queryKey: ROUTINES_KEY });
      const previous = queryClient.getQueryData<RoutineWithItems[]>(ROUTINES_KEY);
      if (previous) {
        queryClient.setQueryData<RoutineWithItems[]>(
          ROUTINES_KEY,
          previous.map((routine) =>
            routine.id === routineId
              ? {
                  ...routine,
                  items: applyOrder(routine.items, order).map((item, i) => ({
                    ...item,
                    orderIndex: i,
                  })),
                }
              : routine,
          ),
        );
      }
      return { previous };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(ROUTINES_KEY, ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ROUTINES_KEY });
    },
  });
}

export function useReorderRoutines() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, ReorderRoutinesRequest, RoutinesCtx>({
    mutationFn: ({ order }) => apiPut<void>('/routines/order', { order }),
    onMutate: async ({ order }) => {
      await queryClient.cancelQueries({ queryKey: ROUTINES_KEY });
      const previous = queryClient.getQueryData<RoutineWithItems[]>(ROUTINES_KEY);
      if (previous) {
        queryClient.setQueryData<RoutineWithItems[]>(
          ROUTINES_KEY,
          applyOrder(previous, order).map((routine, i) => ({ ...routine, orderIndex: i })),
        );
      }
      return { previous };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(ROUTINES_KEY, ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ROUTINES_KEY });
    },
  });
}
