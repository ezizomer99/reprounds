import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CompleteSessionRequest,
  CreateSessionEntryRequest,
  CreateSessionRequest,
  CreateStrengthSetRequest,
  ExerciseHistoryResponse,
  ExercisePRsResponse,
  ExerciseProgressionResponse,
  Session,
  SessionEntryWithSets,
  SessionListResponse,
  SessionWithEntries,
  StrengthSet,
  UpdateSessionEntryRequest,
  UpdateSessionRequest,
  UpdateStrengthSetRequest,
} from '@app/shared';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '../lib/api';

const sessionKey = (id: string) => ['session', id] as const;

/** Immutably replace one entry within a cached session. */
function patchEntry(
  session: SessionWithEntries,
  entryId: string,
  fn: (entry: SessionEntryWithSets) => SessionEntryWithSets,
): SessionWithEntries {
  return {
    ...session,
    entries: session.entries.map((e) => (e.id === entryId ? fn(e) : e)),
  };
}

type SessionCtx = { previous?: SessionWithEntries };

export function useSessions(status?: string) {
  return useQuery<Session[], Error>({
    queryKey: ['sessions', status],
    queryFn: async () => {
      const path = status ? `/sessions?status=${status}` : '/sessions';
      const data = await apiGet<SessionListResponse>(path);
      return data.sessions;
    },
  });
}

export function useActiveSession() {
  const { data, ...rest } = useSessions('in_progress');
  return { activeSession: data?.[0] ?? null, ...rest };
}

export function useDeleteSession() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: string }>({
    mutationFn: ({ id }) => apiDelete(`/sessions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['session'] });
    },
  });
}

export function useExercisePRs(exerciseId: string | null) {
  return useQuery<ExercisePRsResponse, Error>({
    queryKey: ['exercise-prs', exerciseId],
    queryFn: () => apiGet<ExercisePRsResponse>(`/exercises/${exerciseId}/prs`),
    enabled: exerciseId !== null,
  });
}

export function useExerciseProgression(exerciseId: string | null) {
  return useQuery<ExerciseProgressionResponse, Error>({
    queryKey: ['exercise-progression', exerciseId],
    queryFn: () => apiGet<ExerciseProgressionResponse>(`/exercises/${exerciseId}/progression`),
    enabled: exerciseId !== null,
  });
}

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

export function useUpdateSession() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: string } & UpdateSessionRequest>({
    mutationFn: ({ id, ...body }) => apiPatch<void>(`/sessions/${id}`, body),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['session', variables.id] });
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
      // A newly completed session changes stats aggregates and may carry notes.
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['notes'] });
    },
  });
}

export function useReorderSessionEntries() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { sessionId: string; order: string[] }, SessionCtx>({
    mutationFn: ({ sessionId, order }) =>
      apiPut<void>(`/sessions/${sessionId}/entries/order`, { order }),
    onMutate: async ({ sessionId, order }) => {
      const key = sessionKey(sessionId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<SessionWithEntries>(key);
      if (previous) {
        const byId = new Map(previous.entries.map((e) => [e.id, e]));
        const reordered = order
          .map((id) => byId.get(id))
          .filter((e): e is SessionEntryWithSets => e !== undefined);
        // Entries added since the order snapshot was taken keep their spot at the end.
        const missing = previous.entries.filter((e) => !order.includes(e.id));
        queryClient.setQueryData<SessionWithEntries>(key, {
          ...previous,
          entries: [...reordered, ...missing].map((e, i) => ({ ...e, orderIndex: i })),
        });
      }
      return { previous };
    },
    onError: (_e, { sessionId }, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(sessionKey(sessionId), ctx.previous);
    },
    onSettled: (_d, _e, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: sessionKey(sessionId) });
    },
  });
}

export function useAddSessionEntry() {
  const queryClient = useQueryClient();

  return useMutation<
    SessionEntryWithSets,
    Error,
    // exerciseName/disciplineName aren't sent to the API — they label the
    // optimistic entry so it renders correctly before the refetch lands.
    { sessionId: string; exerciseName?: string; disciplineName?: string } & CreateSessionEntryRequest,
    SessionCtx
  >({
    mutationFn: ({ sessionId, exerciseName: _x, disciplineName: _d, ...body }) =>
      apiPost<{ entry: SessionEntryWithSets }>(`/sessions/${sessionId}/entries`, body).then(
        (r) => r.entry,
      ),
    onMutate: async ({ sessionId, exerciseName, disciplineName, ...body }) => {
      const key = sessionKey(sessionId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<SessionWithEntries>(key);
      if (previous) {
        const tempEntry: SessionEntryWithSets = {
          id: `optimistic-${Date.now()}`,
          sessionId,
          kind: body.kind,
          exerciseId: body.exerciseId ?? null,
          disciplineId: body.disciplineId ?? null,
          gi: body.gi ?? null,
          orderIndex: previous.entries.length,
          supersetGroup: null,
          restSeconds: body.restSeconds ?? null,
          details: body.details ?? null,
          notes: body.notes ?? null,
          sets: [],
          exerciseName: exerciseName ?? null,
          disciplineName: disciplineName ?? null,
        };
        queryClient.setQueryData<SessionWithEntries>(key, {
          ...previous,
          entries: [...previous.entries, tempEntry],
        });
      }
      return { previous };
    },
    onError: (_e, { sessionId }, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(sessionKey(sessionId), ctx.previous);
    },
    // Refetch to swap the temp id for the server-assigned entry id.
    onSettled: (_d, _e, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: sessionKey(sessionId) });
    },
  });
}

export function useUpdateSessionEntry() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    { sessionId: string; entryId: string } & UpdateSessionEntryRequest,
    SessionCtx
  >({
    mutationFn: ({ sessionId, entryId, ...body }) =>
      apiPatch<void>(`/sessions/${sessionId}/entries/${entryId}`, body),
    onMutate: async ({ sessionId, entryId, ...patch }) => {
      const key = sessionKey(sessionId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<SessionWithEntries>(key);
      if (previous) {
        queryClient.setQueryData<SessionWithEntries>(
          key,
          patchEntry(previous, entryId, (e) => ({ ...e, ...patch })),
        );
      }
      return { previous };
    },
    onError: (_e, { sessionId }, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(sessionKey(sessionId), ctx.previous);
    },
    // gi can be server-derived from details, so reconcile in the background.
    onSettled: (_d, _e, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: sessionKey(sessionId) });
    },
  });
}

export function useAddStrengthSet() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    { sessionId: string; entryId: string } & CreateStrengthSetRequest,
    SessionCtx
  >({
    mutationFn: ({ sessionId, entryId, ...body }) =>
      apiPost<void>(`/sessions/${sessionId}/entries/${entryId}/sets`, body),
    onMutate: async ({ sessionId, entryId, ...body }) => {
      const key = sessionKey(sessionId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<SessionWithEntries>(key);
      if (previous) {
        const tempSet: StrengthSet = {
          id: `optimistic-${Date.now()}`,
          sessionEntryId: entryId,
          setNumber: body.setNumber,
          setType: body.setType ?? 'normal',
          reps: body.reps ?? null,
          weight: body.weight ?? null,
          rpe: body.rpe ?? null,
          rir: body.rir ?? null,
          completed: body.completed ?? false,
          notes: body.notes ?? null,
        };
        queryClient.setQueryData<SessionWithEntries>(
          key,
          patchEntry(previous, entryId, (e) => ({ ...e, sets: [...e.sets, tempSet] })),
        );
      }
      return { previous };
    },
    onError: (_e, { sessionId }, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(sessionKey(sessionId), ctx.previous);
    },
    // Refetch to swap the temp id for the server-assigned set id.
    onSettled: (_d, _e, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: sessionKey(sessionId) });
    },
  });
}

export function useUpdateStrengthSet() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    { sessionId: string; entryId: string; setId: string } & UpdateStrengthSetRequest,
    SessionCtx
  >({
    mutationFn: ({ sessionId, entryId, setId, ...body }) =>
      apiPatch<void>(`/sessions/${sessionId}/entries/${entryId}/sets/${setId}`, body),
    onMutate: async ({ sessionId, entryId, setId, ...patch }) => {
      const key = sessionKey(sessionId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<SessionWithEntries>(key);
      if (previous) {
        queryClient.setQueryData<SessionWithEntries>(
          key,
          patchEntry(previous, entryId, (e) => ({
            ...e,
            sets: e.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)),
          })),
        );
      }
      return { previous };
    },
    onError: (_e, { sessionId }, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(sessionKey(sessionId), ctx.previous);
    },
    // No server-derived fields on a set; the optimistic patch is authoritative,
    // so skip the invalidate to avoid a full-session refetch on every keystroke.
  });
}

export function useDeleteSessionEntry() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { sessionId: string; entryId: string }, SessionCtx>({
    mutationFn: ({ sessionId, entryId }) =>
      apiDelete(`/sessions/${sessionId}/entries/${entryId}`),
    onMutate: async ({ sessionId, entryId }) => {
      const key = sessionKey(sessionId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<SessionWithEntries>(key);
      if (previous) {
        queryClient.setQueryData<SessionWithEntries>(key, {
          ...previous,
          entries: previous.entries.filter((e) => e.id !== entryId),
        });
      }
      return { previous };
    },
    onError: (_e, { sessionId }, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(sessionKey(sessionId), ctx.previous);
    },
    onSettled: (_d, _e, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: sessionKey(sessionId) });
    },
  });
}

export function useDeleteStrengthSet() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    { sessionId: string; entryId: string; setId: string },
    SessionCtx
  >({
    mutationFn: ({ sessionId, entryId, setId }) =>
      apiDelete(`/sessions/${sessionId}/entries/${entryId}/sets/${setId}`),
    onMutate: async ({ sessionId, entryId, setId }) => {
      const key = sessionKey(sessionId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<SessionWithEntries>(key);
      if (previous) {
        queryClient.setQueryData<SessionWithEntries>(
          key,
          patchEntry(previous, entryId, (e) => ({
            ...e,
            sets: e.sets.filter((s) => s.id !== setId),
          })),
        );
      }
      return { previous };
    },
    onError: (_e, { sessionId }, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(sessionKey(sessionId), ctx.previous);
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
