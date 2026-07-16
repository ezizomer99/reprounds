import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateTechniqueRequest,
  DisciplineCat,
  Technique,
  TechniqueKind,
  TechniqueListResponse,
  UpdateTechniqueRequest,
} from '@app/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from '../lib/api';

interface UseTechniquesParams {
  kind?: TechniqueKind;
  category?: DisciplineCat;
  enabled?: boolean;
}

export function useTechniques(params: UseTechniquesParams = {}) {
  const { kind, category, enabled = true } = params;

  return useQuery<Technique[], Error>({
    queryKey: ['techniques', { kind, category }],
    enabled,
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (kind) qs.set('kind', kind);
      if (category) qs.set('category', category);
      const query = qs.toString();
      const data = await apiGet<TechniqueListResponse>(
        `/techniques${query ? `?${query}` : ''}`,
      );
      return data.techniques;
    },
  });
}

export function useCreateTechnique() {
  const queryClient = useQueryClient();

  return useMutation<Technique, Error, CreateTechniqueRequest>({
    mutationFn: async (body) => {
      const data = await apiPost<{ technique: Technique }>('/techniques', body);
      return data.technique;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['techniques'] });
    },
  });
}

export function useUpdateTechnique() {
  const queryClient = useQueryClient();

  return useMutation<Technique, Error, { id: string } & UpdateTechniqueRequest>({
    mutationFn: async ({ id, ...body }) => {
      const data = await apiPatch<{ technique: Technique }>(`/techniques/${id}`, body);
      return data.technique;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['techniques'] });
    },
  });
}

export function useDeleteTechnique() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => apiDelete(`/techniques/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['techniques'] });
    },
  });
}
