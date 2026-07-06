import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { NotesTimelineResponse, TagListResponse } from '@app/shared';
import { apiGet } from '../lib/api';

/** Latest note-bearing sessions for the stats-page card. */
export function useRecentNotes(limit = 3) {
  return useQuery<NotesTimelineResponse, Error>({
    queryKey: ['notes', 'recent', limit],
    queryFn: () => apiGet<NotesTimelineResponse>(`/notes?limit=${limit}`),
    staleTime: 5 * 60 * 1000,
  });
}

/** Infinite timeline of all notes, newest first, optionally filtered by tag/query. */
export function useNotesTimeline(opts: { tag?: string | null; q?: string | null } = {}) {
  const { tag, q } = opts;
  return useInfiniteQuery<NotesTimelineResponse, Error>({
    queryKey: ['notes', 'timeline', tag ?? null, q ?? null],
    queryFn: ({ pageParam }) => {
      const qs = new URLSearchParams({ limit: '20' });
      if (pageParam) qs.set('cursor', pageParam as string);
      if (tag) qs.set('tag', tag);
      if (q) qs.set('q', q);
      return apiGet<NotesTimelineResponse>(`/notes?${qs.toString()}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 5 * 60 * 1000,
  });
}

/** Distinct technique tags with counts — autocomplete + filter chips. */
export function useTechniqueTags() {
  return useQuery<TagListResponse, Error>({
    queryKey: ['notes', 'tags'],
    queryFn: () => apiGet<TagListResponse>('/notes/tags'),
    staleTime: 5 * 60 * 1000,
  });
}
