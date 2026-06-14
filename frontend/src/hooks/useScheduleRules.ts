import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CalendarResponse,
  CreateScheduleRuleRequest,
  ScheduleRule,
  ScheduleRuleListResponse,
  UpdateScheduleRuleRequest,
} from '@app/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from '../lib/api';

export function useScheduleRules() {
  return useQuery<ScheduleRule[], Error>({
    queryKey: ['scheduleRules'],
    queryFn: async () => {
      const data = await apiGet<ScheduleRuleListResponse>('/schedule-rules');
      return data.rules;
    },
  });
}

export function useCalendar(from: string, to: string) {
  return useQuery<CalendarResponse, Error>({
    queryKey: ['calendar', from, to],
    queryFn: () => apiGet<CalendarResponse>(`/calendar?from=${from}&to=${to}`),
    enabled: Boolean(from && to),
  });
}

export function useCreateScheduleRule() {
  const queryClient = useQueryClient();

  return useMutation<ScheduleRule, Error, CreateScheduleRuleRequest>({
    mutationFn: (body) => apiPost<ScheduleRule>('/schedule-rules', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduleRules'] });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
    },
  });
}

interface UpdateScheduleRuleMutationVars extends UpdateScheduleRuleRequest {
  id: string;
  mode: 'single' | 'following' | 'all';
  date?: string;
}

export function useUpdateScheduleRule() {
  const queryClient = useQueryClient();

  return useMutation<ScheduleRule, Error, UpdateScheduleRuleMutationVars>({
    mutationFn: ({ id, mode, date, ...body }) =>
      apiPatch<ScheduleRule>(
        `/schedule-rules/${id}?mode=${mode}${date ? `&date=${date}` : ''}`,
        body,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduleRules'] });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
    },
  });
}

interface DeleteScheduleRuleMutationVars {
  id: string;
  mode: 'single' | 'following' | 'all';
  date?: string;
}

export function useDeleteScheduleRule() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, DeleteScheduleRuleMutationVars>({
    mutationFn: ({ id, mode, date }) =>
      apiDelete(
        `/schedule-rules/${id}?mode=${mode}${date ? `&date=${date}` : ''}`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduleRules'] });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
    },
  });
}
