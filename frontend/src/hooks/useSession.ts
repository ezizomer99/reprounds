import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CompleteSessionRequest,
  CreateSessionEntryRequest,
  CreateSessionRequest,
  CreateStrengthSetRequest,
  ExerciseHistoryResponse,
  SessionWithEntries,
  UpdateSessionEntryRequest,
  UpdateStrengthSetRequest,
} from '@app/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from '../lib/api';

export function useSession(id: string | null) {
  return useQuery<SessionWithEntries, Error>({
    queryKey: ['session', id],
    queryFn: async () => {
      const data = await apiGet<{ session: SessionWithEntries }>(`/sessions/${id}`);
      return data.session;
    },
    enabled: id !== null,
  });
}

export function useCreateSession() {
  const queryClient = useQueryClient();

  return useMutation<SessionWithEntries, Error, CreateSessionRequest>({
    mutationFn: (body) =>
      apiPost<{ session: SessionWithEntries }>('/sessions', body).then((r) => r.session),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

export function useCompleteSession() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id: string } & CompleteSessionRequest>({
    mutationFn: ({ id, ...body }) =>
      apiPost<void>(`/sessions/${id}/complete`, body),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['session', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

export function useAddSessionEntry() {
  const queryClient = useQueryClient();

  return useMutation<
    SessionWithEntries,
    Error,
    { sessionId: string } & CreateSessionEntryRequest
  >({
    mutationFn: ({ sessionId, ...body }) =>
      apiPost<{ session: SessionWithEntries }>(`/sessions/${sessionId}/entries`, body).then(
        (r) => r.session,
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['session', variables.sessionId] });
    },
  });
}

export function useUpdateSessionEntry() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    { sessionId: string; entryId: string } & UpdateSessionEntryRequest
  >({
    mutationFn: ({ sessionId, entryId, ...body }) =>
      apiPatch<void>(`/sessions/${sessionId}/entries/${entryId}`, body),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['session', variables.sessionId] });
    },
  });
}

export function useAddStrengthSet() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    { sessionId: string; entryId: string } & CreateStrengthSetRequest
  >({
    mutationFn: ({ sessionId, entryId, ...body }) =>
      apiPost<void>(`/sessions/${sessionId}/entries/${entryId}/sets`, body),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['session', variables.sessionId] });
    },
  });
}

export function useUpdateStrengthSet() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    { sessionId: string; entryId: string; setId: string } & UpdateStrengthSetRequest
  >({
    mutationFn: ({ sessionId, entryId, setId, ...body }) =>
      apiPatch<void>(`/sessions/${sessionId}/entries/${entryId}/sets/${setId}`, body),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['session', variables.sessionId] });
    },
  });
}

export function useDeleteStrengthSet() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    { sessionId: string; entryId: string; setId: string }
  >({
    mutationFn: ({ sessionId, entryId, setId }) =>
      apiDelete(`/sessions/${sessionId}/entries/${entryId}/sets/${setId}`),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['session', variables.sessionId] });
    },
  });
}

export function useExerciseHistory(exerciseId: string | null) {
  return useQuery<ExerciseHistoryResponse, Error>({
    queryKey: ['exercise-history', exerciseId],
    queryFn: () => apiGet<ExerciseHistoryResponse>(`/exercises/${exerciseId}/history`),
    enabled: exerciseId !== null,
  });
}
