import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { BrandMark } from '../components/BrandMark';
import {
  defaultSettings,
  loadSettings,
  onPreview,
  saveSettings,
  voiceArtwork,
  voiceOptions,
  type VoiceSettings,
} from '../data/voiceSettingsPlaceholder';
import './ProfilePage.css';
import './VoiceSettingsPage.css';

type LoadState = 'loading' | 'ready' | 'error';
type SaveState = 'saved' | 'pending' | 'saving' | 'error';

interface VoiceSelectorProps {
  settings: VoiceSettings;
  disabled: boolean;
  onChange: (voiceId: VoiceSettings['voiceId']) => void;
}

function VoiceSelector({ settings, disabled, onChange }: VoiceSelectorProps) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange(event.target.value as VoiceSettings['voiceId']);
  }

  return (
    <fieldset aria-describedby="voice-selector-hint" className="voice-selector">
      <legend className="profile-section-title">Choose a voice</legend>
      <p className="voice-section-hint" id="voice-selector-hint">Pick the sound that feels right for your Agent.</p>
      <div className="voice-card-grid">
        {voiceOptions.map((voice) => (
          <label className="voice-choice" key={voice.id}>
            <input
              aria-describedby={`voice-description-${voice.id}`}
              checked={settings.voiceId === voice.id}
              className="voice-choice-input"
              disabled={disabled}
              name="agent-voice"
              onChange={handleChange}
              type="radio"
              value={voice.id}
            />
            <span className={`voice-choice-card${settings.voiceId === voice.id ? ' is-selected' : ''}`}>
              <span aria-hidden="true" className="voice-artwork">
                <img alt="" className="voice-artwork-image" src={voiceArtwork[voice.id]} />
              </span>
              <span className="voice-choice-copy">
                <span className="voice-choice-heading">
                  <span className="voice-choice-name profile-handwritten">{voice.label}</span>
                  <span aria-hidden="true" className="voice-choice-check">✓</span>
                </span>
                <span className="voice-choice-description" id={`voice-description-${voice.id}`}>{voice.description}</span>
                <span className="voice-choice-select-hint">{settings.voiceId === voice.id ? 'Selected' : 'Choose this voice'}</span>
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

interface VolumeControlProps {
  volume: number;
  disabled: boolean;
  onChange: (volume: number) => void;
  onToggleMute: () => void;
}

function VolumeControl({ volume, disabled, onChange, onToggleMute }: VolumeControlProps) {
  const isMuted = volume === 0;

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const direction = ['ArrowRight', 'ArrowUp'].includes(event.key)
      ? 1
      : ['ArrowLeft', 'ArrowDown'].includes(event.key)
        ? -1
        : 0;
    if (!direction) return;
    event.preventDefault();
    onChange(volume + direction * 5);
  }

  return (
    <section aria-labelledby="volume-title" className="profile-card voice-volume-section">
      <div className="voice-volume-heading">
        <div>
          <p className="profile-eyebrow">Just the right level</p>
          <h2 className="profile-section-title" id="volume-title">Voice volume</h2>
        </div>
        <output className="voice-volume-value" htmlFor="voice-volume">{volume}<span>%</span></output>
      </div>
      <div className="voice-slider-row">
        <span aria-hidden="true" className="voice-volume-mark">−</span>
        <div className="voice-range-wrap">
          <label className="profile-visually-hidden" htmlFor="voice-volume">Agent voice volume</label>
          <input
            aria-valuetext={`${volume} percent`}
            className="voice-range"
            disabled={disabled}
            id="voice-volume"
            max={100}
            min={0}
            onChange={(event) => onChange(Number(event.target.value))}
            onKeyDown={handleKeyDown}
            step={1}
            type="range"
            value={volume}
          />
          <span aria-hidden="true" className="voice-range-ticks"><i /><i /><i /><i /><i /></span>
        </div>
        <span aria-hidden="true" className="voice-volume-mark">＋</span>
        <button
          aria-label={isMuted ? 'Unmute Agent voice' : 'Mute Agent voice'}
          aria-pressed={isMuted}
          className="profile-button profile-button--quiet voice-mute-button"
          disabled={disabled}
          onClick={onToggleMute}
          type="button"
        >
          <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
            <path d="M4 10v4h4l5 4V6l-5 4H4Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
            {isMuted ? <path d="m17 9 5 6m0-6-5 6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" /> : <path d="M16 9a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />}
          </svg>
          {isMuted ? 'Unmute' : 'Mute'}
        </button>
      </div>
      <p className="voice-volume-hint">Use the arrow keys for gentle 5% steps.</p>
    </section>
  );
}

function PreviewControl({ settings, disabled }: { settings: VoiceSettings; disabled: boolean }) {
  return (
    <section aria-labelledby="voice-preview-title" className="voice-preview-section">
      <div>
        <p className="profile-eyebrow">A little listen</p>
        <h2 className="profile-section-title" id="voice-preview-title">Try this setting</h2>
        <p className="voice-section-hint">Preview is ready to connect when voice playback is available.</p>
      </div>
      <button className="profile-button profile-button--primary voice-preview-button" disabled={disabled} onClick={() => onPreview(settings)} type="button">
        <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
          <path d="m9 6 10 6-10 6V6Z" fill="currentColor" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.3" />
        </svg>
        Hear it
      </button>
    </section>
  );
}

function SaveIndicator({ state, error, onRetry }: { state: SaveState | null; error: string; onRetry: () => void }) {
  return (
    <div className="voice-save-area">
      {state === 'saved' ? <p className="voice-save-indicator" role="status"><span aria-hidden="true">✳</span> Settings saved</p> : null}
      {state === 'pending' || state === 'saving' ? <p className="voice-save-indicator voice-save-indicator--pending" role="status">{state === 'pending' ? 'Saving soon…' : 'Saving your settings…'}</p> : null}
      {state === 'error' ? (
        <div className="voice-save-error" role="alert">
          <p>{error}</p>
          <button className="profile-button profile-button--quiet voice-retry-button" onClick={onRetry} type="button">Try saving again</button>
        </div>
      ) : null}
    </div>
  );
}

export function VoiceSettingsPage() {
  const [settings, setSettings] = useState<VoiceSettings | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [saveError, setSaveError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveAttempt, setSaveAttempt] = useState(0);
  const savedSettingsKey = useRef('');
  const saveRequestId = useRef(0);
  const forceSave = useRef(false);
  const previousVolume = useRef(defaultSettings.volume);
  const isLoading = loadState === 'loading';
  const controlsDisabled = isLoading || loadState === 'error' || settings === null;
  const displayedSettings = settings ?? defaultSettings;

  useEffect(() => {
    let active = true;
    setLoadState('loading');
    setLoadError('');
    loadSettings()
      .then((loadedSettings) => {
        if (!active) return;
        setSettings(loadedSettings);
        savedSettingsKey.current = `${loadedSettings.voiceId}:${loadedSettings.volume}`;
        previousVolume.current = loadedSettings.volume > 0 ? loadedSettings.volume : defaultSettings.volume;
        setLoadState('ready');
      })
      .catch(() => {
        if (!active) return;
        setLoadError('Your voice settings couldn’t be opened. Please try again.');
        setLoadState('error');
      });
    return () => { active = false; };
  }, [loadAttempt]);

  useEffect(() => {
    if (!settings || loadState !== 'ready') return;
    const settingsKey = `${settings.voiceId}:${settings.volume}`;
    if (settingsKey === savedSettingsKey.current && !forceSave.current) {
      setSaveState('saved');
      setSaveError('');
      return;
    }

    forceSave.current = false;
    const requestId = ++saveRequestId.current;
    setSaveState('pending');
    setSaveError('');
    const debounceId = window.setTimeout(async () => {
      setSaveState('saving');
      try {
        await saveSettings(settings);
        if (requestId !== saveRequestId.current) return;
        savedSettingsKey.current = settingsKey;
        setSaveState('saved');
      } catch {
        if (requestId !== saveRequestId.current) return;
        setSaveError('We couldn’t save those settings just now.');
        setSaveState('error');
      }
    }, 450);

    return () => {
      window.clearTimeout(debounceId);
      if (requestId === saveRequestId.current) saveRequestId.current += 1;
    };
  }, [settings, loadState, saveAttempt]);

  function updateVolume(nextVolume: number) {
    if (!settings || controlsDisabled) return;
    const volume = Math.min(100, Math.max(0, Math.round(nextVolume)));
    if (volume > 0) previousVolume.current = volume;
    setSettings((current) => current ? { ...current, volume } : current);
  }

  function toggleMute() {
    if (!settings || controlsDisabled) return;
    if (settings.volume > 0) {
      previousVolume.current = settings.volume;
      updateVolume(0);
    } else {
      updateVolume(previousVolume.current > 0 ? previousVolume.current : defaultSettings.volume);
    }
  }

  function retryLoad() {
    setSettings(null);
    setLoadAttempt((attempt) => attempt + 1);
  }

  function retrySave() {
    forceSave.current = true;
    setSaveAttempt((attempt) => attempt + 1);
  }

  return (
    <main className="profile-page voice-settings-page">
      <div className="profile-shell voice-settings-shell">
        <header className="profile-topbar voice-settings-topbar">
          <a aria-label="Week by week home" className="profile-brand" href="/">
            <BrandMark className="profile-brand-logo" />
            <span>Week by week</span>
          </a>
          <a className="profile-navigation voice-back-link" href="weekly">
            <svg aria-hidden="true" fill="none" viewBox="0 0 20 20"><path d="M16 10H4m5-5-5 5 5 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" /></svg>
            Back to my weeks
          </a>
        </header>

        <div className="profile-page-intro voice-settings-intro">
          <div>
            <p className="profile-eyebrow">YOUR AGENT</p>
            <h1 className="voice-page-title profile-handwritten">Voice settings</h1>
            <p className="profile-page-caption">A voice that feels like yours.</p>
          </div>
          <svg aria-hidden="true" className="voice-intro-doodle" fill="none" viewBox="0 0 100 70">
            <path d="M16 35h9l8-11v22l-8-11m18-8a12 12 0 0 1 0 16m7-22a20 20 0 0 1 0 28m20-30c4 7 10 11 19 13-9 2-15 6-19 13-3-7-8-11-16-13 8-2 13-6 16-13Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          </svg>
        </div>

        {loadState === 'error' ? (
          <div className="voice-load-error" role="alert">
            <p>{loadError}</p>
            <button className="profile-button profile-button--quiet" onClick={retryLoad} type="button">Try again</button>
          </div>
        ) : null}

        <div aria-busy={isLoading} className="voice-settings-content">
          {isLoading ? <p aria-live="polite" className="voice-loading-note profile-handwritten">Gathering your settings…</p> : null}
          <VoiceSelector
            disabled={controlsDisabled}
            onChange={(voiceId) => setSettings((current) => current ? { ...current, voiceId } : current)}
            settings={displayedSettings}
          />

          <VolumeControl
            disabled={controlsDisabled}
            onChange={updateVolume}
            onToggleMute={toggleMute}
            volume={displayedSettings.volume}
          />

          <PreviewControl disabled={controlsDisabled} settings={displayedSettings} />

          <SaveIndicator
            error={saveError}
            onRetry={retrySave}
            state={loadState === 'ready' ? saveState : null}
          />
        </div>
      </div>
    </main>
  );
}
