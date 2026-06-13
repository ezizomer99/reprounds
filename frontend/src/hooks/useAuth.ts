import { useQuery } from '@tanstack/react-query';
import type { User } from '@app/shared';
import { apiGet } from '../lib/api';
import { clearSessionToken } from '../lib/auth';

interface MeResponse {
  user: User;
}

export function useCurrentUser() {
  return useQuery<User, Error>({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      try {
        const data = await apiGet<MeResponse>('/auth/me');
        return data.user;
      } catch (err) {
        const status = (err as Error & { status?: number }).status;
        if (status === 401) {
          await clearSessionToken();
        }
        throw err;
      }
    },
    retry: false,
  });
}
