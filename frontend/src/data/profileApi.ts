export interface Profile {
  name: string;
  email: string;
  avatarUrl: string | null;
}

export interface PasswordResult {
  ok: boolean;
  message?: string;
}

class ApiResponseError extends Error {}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new ApiResponseError(`The profile service returned an unexpected response (HTTP ${response.status}).`);
  }
  const result = await response.json();
  if (!response.ok) {
    throw new ApiResponseError(result.message || `The profile request failed (HTTP ${response.status}).`);
  }
  return result as T;
}

export async function loadProfile(): Promise<Profile> {
  const result = await readJson<{ profile: Profile }>(
    await fetch('/api/profile', { credentials: 'same-origin' }),
  );
  return result.profile;
}

export async function saveProfileName(name: string): Promise<Profile> {
  const result = await readJson<{ profile: Profile }>(await fetch('/api/profile', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  }));
  return result.profile;
}

export async function saveProfilePicture(file: File): Promise<Profile> {
  const form = new FormData();
  form.append('picture', file);
  const result = await readJson<{ profile: Profile }>(await fetch('/api/profile/picture', {
    method: 'POST',
    credentials: 'same-origin',
    body: form,
  }));
  return result.profile;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<PasswordResult> {
  try {
    await readJson(await fetch('/api/profile/password', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    }));
    return { ok: true };
  } catch (error) {
    if (error instanceof ApiResponseError) return { ok: false, message: error.message };
    throw error;
  }
}

export async function requestAccountDeletion(confirmation: string): Promise<void> {
  await readJson(await fetch('/api/profile', {
    method: 'DELETE',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmation }),
  }));
}
