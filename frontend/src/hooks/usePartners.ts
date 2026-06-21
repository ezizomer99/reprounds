import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreatePartnerRequest,
  Partner,
  PartnerListResponse,
} from '@app/shared';
import { apiDelete, apiGet, apiPost } from '../lib/api';

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

export function useDeletePartner() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => apiDelete(`/partners/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partners'] });
    },
  });
}
