import { resolveApiOrigin, resolveApiBaseUrl } from './config';

describe('resolveApiOrigin', () => {
  it('uses EXPO_PUBLIC_API_URL when provided', () => {
    expect(resolveApiOrigin({ EXPO_PUBLIC_API_URL: 'https://api.reprounds.app' })).toBe(
      'https://api.reprounds.app',
    );
  });

  it('strips trailing slashes', () => {
    expect(resolveApiOrigin({ EXPO_PUBLIC_API_URL: 'https://api.reprounds.app//' })).toBe(
      'https://api.reprounds.app',
    );
  });

  it('falls back to the dev Worker when unset or blank', () => {
    expect(resolveApiOrigin({})).toContain('workers.dev');
    expect(resolveApiOrigin({ EXPO_PUBLIC_API_URL: '   ' })).toContain('workers.dev');
  });
});

describe('resolveApiBaseUrl', () => {
  it('appends the /v1 version segment to the origin', () => {
    expect(resolveApiBaseUrl({ EXPO_PUBLIC_API_URL: 'https://api.reprounds.app' })).toBe(
      'https://api.reprounds.app/v1',
    );
  });
});
