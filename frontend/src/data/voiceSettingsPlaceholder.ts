export const voiceOptions = [
  {
    id: 'cartoony',
    label: 'Cartoony',
    description: 'Bright, playful, and full of character.',
  },
  {
    id: 'human',
    label: 'Human',
    description: 'Warm, natural, and easy to listen to.',
  },
] as const;

export type VoiceId = (typeof voiceOptions)[number]['id'];

export interface VoiceSettings {
  voiceId: VoiceId;
  volume: number;
}

export const defaultSettings: VoiceSettings = {
  voiceId: 'cartoony',
  volume: 70,
};

export const voiceArtwork: Record<VoiceId, string> = {
  cartoony: `${import.meta.env.BASE_URL}assets/agent-placeholder.svg`,
  human: `${import.meta.env.BASE_URL}assets/data-state.svg`,
};

function pause(milliseconds = 300) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

// TODO: connect to real implementation
export async function loadSettings(): Promise<VoiceSettings> {
  await pause();
  return { ...defaultSettings };
}

// TODO: connect to real implementation
export async function saveSettings(settings: VoiceSettings): Promise<void> {
  await pause();
  void settings;
}

// TODO: connect to real implementation
export function onPreview(settings: VoiceSettings): void {
  console.log('Voice preview requested:', settings);
}
