import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreatePartnerRequest,
  Partner,
  PartnerListResponse,
  PartnerStatsResponse,
  UpdatePartnerRequest,
} from '@app/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from '../lib/api';

export function usePartnerStats() {
  return useQuery<PartnerStatsResponse, Error>({
    queryKey: ['stats', 'partners'],
    queryFn: () => apiGet<PartnerStatsResponse>('/stats/partners'),
    staleTime: 5 * 60 * 1000,
  });
}

export function usePartners() {
  return useQuery<Partner[], Error>({
    queryKey: ['partners'],
    queryFn: async () => {
      const data = await apiGet<PartnerListResponse>('/partners');
      return data.partners;
    },
  });
}

export function useCreatePartner() {
  const queryClient = useQueryClient();

  return useMutation<Partner, Error, CreatePartnerRequest>({
    mutationFn: (body) =>
      apiPost<{ partner: Partner }>('/partners', body).then((r) => r.partner),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partners'] });
    },
  });
}

export function useUpdatePartner() {
  const queryClient = useQueryClient();

  return useMutation<Partner, Error, { id: string } & UpdatePartnerRequest>({
    mutationFn: ({ id, ...body }) =>
      apiPatch<{ partner: Partner }>(`/partners/${id}`, body).then((r) => r.partner),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partners'] });
      queryClient.invalidateQueries({ queryKey: ['stats', 'partners'] });
    },
  });
}

export function useDeletePartner() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => apiDelete(`/partners/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partners'] });
      queryClient.invalidateQueries({ queryKey: ['stats', 'partners'] });
    },
  });
}
