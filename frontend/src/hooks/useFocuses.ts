import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateFocusRequest,
  FocusListResponse,
  FocusStatus,
  FocusWithStats,
  UpdateFocusRequest,
} from '@app/shared';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '../lib/api';

export function useFocuses(status?: FocusStatus) {
  return useQuery<FocusWithStats[], Error>({
    queryKey: ['focuses', status ?? 'all'],
    queryFn: async () => {
      const path = status ? `/focuses?status=${status}` : '/focuses';
      const data = await apiGet<FocusListResponse>(path);
      return data.focuses;
    },
  });
}

export function useCreateFocus() {
  const queryClient = useQueryClient();

  return useMutation<FocusWithStats, Error, CreateFocusRequest>({
    mutationFn: (body) =>
      apiPost<{ focus: FocusWithStats }>('/focuses', body).then((r) => r.focus),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['focuses'] });
    },
  });
}

export function useUpdateFocus() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id: string } & UpdateFocusRequest>({
    mutationFn: ({ id, ...body }) => apiPatch<void>(`/focuses/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['focuses'] });
    },
  });
}

export function useDeleteFocus() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => apiDelete(`/focuses/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['focuses'] });
    },
  });
}

/** Replace the set of focuses ticked as worked on during a session. */
export function useSetSessionFocuses() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { sessionId: string; focusIds: string[] }>({
    mutationFn: ({ sessionId, focusIds }) =>
      apiPut<void>(`/sessions/${sessionId}/focuses`, { focusIds }),
    onSuccess: (_data, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
      // Session counts / last-worked dates change when ticks change.
      queryClient.invalidateQueries({ queryKey: ['focuses'] });
    },
  });
}
