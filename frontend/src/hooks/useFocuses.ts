import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateFocusRequest,
  Focus,
  FocusListResponse,
  UpdateFocusRequest,
} from '@app/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from '../lib/api';

export function useFocuses() {
  return useQuery<Focus[], Error>({
    queryKey: ['focuses'],
    queryFn: async () => {
      const data = await apiGet<FocusListResponse>('/focuses');
      return data.focuses;
    },
  });
}

export function useCreateFocus() {
  const queryClient = useQueryClient();

  return useMutation<Focus, Error, CreateFocusRequest>({
    mutationFn: (body) =>
      apiPost<{ focus: Focus }>('/focuses', body).then((r) => r.focus),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['focuses'] });
    },
  });
}

export function useUpdateFocus() {
  const queryClient = useQueryClient();

  return useMutation<Focus, Error, { id: string } & UpdateFocusRequest>({
    mutationFn: ({ id, ...body }) =>
      apiPatch<{ focus: Focus }>(`/focuses/${id}`, body).then((r) => r.focus),
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
