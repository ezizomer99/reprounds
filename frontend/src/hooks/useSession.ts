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
import * as Crypto from 'expo-crypto';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '../lib/api';
import { localTodayISO } from '../lib/calendar';

const sessionKey = (id: string) => ['session', id] as const;

/**
 * Id for a row that exists only in the optimistic cache until the server
 * assigns a real one. Was `optimistic-${Date.now()}`, which collided whenever
 * two rows were added in the same millisecond — and they routinely are, since
 * warm-up generation and "add N sets" fire the mutation in a loop. Colliding
 * ids made `patchEntry` update both rows at once.
 */
const optimisticId = () => `optimistic-${Crypto.randomUUID()}`;

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

/**
 * The backend defaults to 50 rows and caps at 200. Callers that aggregate over
 * history — streaks, weekly averages, lifetime counts — were silently working
 * off the 50 most recent sessions and quietly going wrong for anyone training
 * regularly for more than a couple of months. `limit` is part of the query key
 * so a 200-row fetch and a 50-row fetch can't share a cache entry.
 */
export function useSessions(status?: string, limit?: number) {
  return useQuery<Session[], Error>({
    queryKey: ['sessions', status, limit],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (limit !== undefined) params.set('limit', String(limit));
      const qs = params.toString();
      const data = await apiGet<SessionListResponse>(`/sessions${qs ? `?${qs}` : ''}`);
      return data.sessions;
    },
  });
}

/** Backend maximum for a single /sessions page. */
export const MAX_SESSIONS_PAGE = 200;

export function useActiveSession() {
  const { data, ...rest } = useSessions('in_progress');
  return { activeSession: data?.[0] ?? null, ...rest };
}

/**
 * Sessions inside an inclusive local-date range (one calendar month). The key
 * stays under the ['sessions'] root so every existing mutation invalidation
 * (create/start/complete/delete/reschedule) refreshes calendar months too.
 */
export function useSessionsInRange(from: string, to: string, enabled = true) {
  return useQuery<Session[], Error>({
    queryKey: ['sessions', 'range', from, to],
    queryFn: async () => {
      const data = await apiGet<SessionListResponse>(`/sessions?from=${from}&to=${to}&limit=200`);
      return data.sessions;
    },
    enabled,
  });
}

/**
 * Flip a planned (scheduled) session live. Sends the client-local today so an
 * overdue planned session snaps to the day it actually runs. 409s surface as
 * ApiError: `active_session_exists` (with body.sessionId) or `not_planned`.
 */
export function useStartSession() {
  const queryClient = useQueryClient();
  return useMutation<SessionWithEntries, Error, { id: string }>({
    mutationFn: ({ id }) =>
      apiPost<{ session: SessionWithEntries }>(`/sessions/${id}/start`, { date: localTodayISO() })
        .then((r) => r.session),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['session', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
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
          id: optimisticId(),
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
          id: optimisticId(),
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
