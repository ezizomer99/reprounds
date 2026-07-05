import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { NotesTimelineResponse } from '@app/shared';
import { apiGet } from '../lib/api';

/** Latest note-bearing sessions for the stats-page card. */
export function useRecentNotes(limit = 3) {
  return useQuery<NotesTimelineResponse, Error>({
    queryKey: ['notes', 'recent', limit],
    queryFn: () => apiGet<NotesTimelineResponse>(`/notes?limit=${limit}`),
    staleTime: 5 * 60 * 1000,
  });
}

/** Infinite timeline of all notes, newest first, for the /notes screen. */
export function useNotesTimeline() {
  return useInfiniteQuery<NotesTimelineResponse, Error>({
    queryKey: ['notes', 'timeline'],
    queryFn: ({ pageParam }) =>
      apiGet<NotesTimelineResponse>(`/notes?limit=20${pageParam ? `&cursor=${pageParam}` : ''}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 5 * 60 * 1000,
  });
}
