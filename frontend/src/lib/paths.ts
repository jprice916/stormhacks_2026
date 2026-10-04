const frontendBasePath = import.meta.env.BASE_URL.replace(/\/+$/, '');

export const frontendPaths = {
  home: import.meta.env.BASE_URL,
  login: `${import.meta.env.BASE_URL}login`,
  logger: `${import.meta.env.BASE_URL}logger`,
  myVideos: `${import.meta.env.BASE_URL}my-videos`,
  recordings: `${import.meta.env.BASE_URL}recordings`,
  weekly: `${import.meta.env.BASE_URL}weekly`,
  profile: `${import.meta.env.BASE_URL}profile`,
  voiceSettings: `${import.meta.env.BASE_URL}voice-settings`,
} as const;

export function resolveFrontendPath(pathname: string): string {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';

  if (!frontendBasePath) {
    return normalizedPath;
  }

  if (normalizedPath === frontendBasePath) {
    return '/';
  }

  if (normalizedPath.startsWith(`${frontendBasePath}/`)) {
    return normalizedPath.slice(frontendBasePath.length);
  }

  return normalizedPath;
}
