import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateRankPromotionRequest,
  RankPromotion,
  RankPromotionListResponse,
} from '@app/shared';
import { apiDelete, apiGet, apiPost } from '../lib/api';

export function usePromotions(disciplineId: string | null) {
  return useQuery<RankPromotion[], Error>({
    queryKey: ['promotions', disciplineId],
    queryFn: async () => {
      const data = await apiGet<RankPromotionListResponse>(`/promotions?disciplineId=${disciplineId}`);
      return data.promotions;
    },
    enabled: disciplineId !== null,
  });
}

export function useCreatePromotion() {
  const queryClient = useQueryClient();
  return useMutation<RankPromotion, Error, CreateRankPromotionRequest>({
    mutationFn: (body) =>
      apiPost<{ promotion: RankPromotion }>('/promotions', body).then((r) => r.promotion),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['promotions', variables.disciplineId] });
    },
  });
}

export function useDeletePromotion(disciplineId: string | null) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => apiDelete(`/promotions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promotions', disciplineId] });
    },
  });
}
