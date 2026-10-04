export interface Profile {
  name: string;
  email: string;
  avatarUrl: string | null;
}

export interface PasswordResult {
  ok: boolean;
  message?: string;
}

let profile: Profile = {
  name: 'Maya Chen',
  email: 'maya.chen@example.com',
  avatarUrl: null,
};

function pause(milliseconds = 450) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

// TODO: replace with Flask route
export async function loadProfile(): Promise<Profile> {
  await pause(250);
  return { ...profile };
}

// TODO: replace with Flask route
export async function saveProfileName(name: string): Promise<Profile> {
  await pause();
  profile = { ...profile, name };
  return { ...profile };
}

// TODO: replace with Flask route
export async function saveProfilePicture(file: File): Promise<Profile> {
  await pause();
  const avatarUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('The picture could not be read.'));
    };
    reader.onerror = () => reject(new Error('The picture could not be read.'));
    reader.readAsDataURL(file);
  });
  profile = { ...profile, avatarUrl };
  return { ...profile };
}

// TODO: replace with Flask route
export async function changePassword(currentPassword: string, _newPassword: string): Promise<PasswordResult> {
  await pause(650);
  if (currentPassword.trim().toLowerCase() === 'incorrect') {
    return { ok: false, message: 'That current password doesn’t look right. Please try again.' };
  }
  return { ok: true };
}

// TODO: replace with Flask route
export async function requestAccountDeletion(): Promise<void> {
  await pause(650);
}
