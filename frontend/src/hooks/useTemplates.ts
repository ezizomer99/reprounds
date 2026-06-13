import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AddTemplateItemRequest,
  CreateTemplateRequest,
  ReorderTemplateItemsRequest,
  TemplateListResponse,
  TemplateWithItems,
  UpdateTemplateRequest,
} from '@app/shared';
import { apiDelete, apiGet, apiPost, apiPatch, apiPut } from '../lib/api';

export function useTemplates() {
  return useQuery<TemplateWithItems[], Error>({
    queryKey: ['templates'],
    queryFn: async () => {
      const data = await apiGet<TemplateListResponse>('/templates');
      return data.templates;
    },
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();

  return useMutation<TemplateWithItems, Error, CreateTemplateRequest>({
    mutationFn: (body) => apiPost<TemplateWithItems>('/templates', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();

  return useMutation<TemplateWithItems, Error, { id: string } & UpdateTemplateRequest>({
    mutationFn: ({ id, ...body }) =>
      apiPatch<TemplateWithItems>(`/templates/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => apiDelete(`/templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });
}

export function useAddTemplateItem() {
  const queryClient = useQueryClient();

  return useMutation<TemplateWithItems, Error, { templateId: string } & AddTemplateItemRequest>({
    mutationFn: ({ templateId, ...body }) =>
      apiPost<TemplateWithItems>(`/templates/${templateId}/items`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });
}

export function useRemoveTemplateItem() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { templateId: string; itemId: string }>({
    mutationFn: ({ templateId, itemId }) =>
      apiDelete(`/templates/${templateId}/items/${itemId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });
}

export function useReorderTemplateItems() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { templateId: string } & ReorderTemplateItemsRequest>({
    mutationFn: ({ templateId, order }) =>
      apiPut<void>(`/templates/${templateId}/items/order`, { order }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });
}
