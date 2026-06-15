import { useQuery } from '@tanstack/react-query';
import type { CalendarResponse } from '@app/shared';
import { apiGet } from '../lib/api';

export function useCalendar(from: string, to: string) {
  return useQuery<CalendarResponse, Error>({
    queryKey: ['calendar', from, to],
    queryFn: () => apiGet<CalendarResponse>(`/calendar?from=${from}&to=${to}`),
    enabled: Boolean(from && to),
  });
}
