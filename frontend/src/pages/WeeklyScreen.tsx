import { useCallback, useEffect, useRef, useState } from 'react';
import { Agent } from '../components/Agent/Agent';
import { AgentSidebar } from '../components/Agent/AgentSidebar';
import { Bubble } from '../components/Bubble/Bubble';
import { Carousel } from '../components/Carousel/Carousel';
import { weeklyPreviewEntries, weeklyPreviewItems } from '../data/weeklyPreview';

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' }).format(date);
}

export function WeeklyScreen() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedDate, setSelectedDate] = useState('2026-10-02');
  const [weekStartDate, setWeekStartDate] = useState('2026-09-27');
  const [weekStartLabel, setWeekStartLabel] = useState('September 27');
  const [isAgentSidebarOpen, setIsAgentSidebarOpen] = useState(false);

  // Audio / TTS state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioCacheRef = useRef<Map<string, string>>(new Map());

  const agentButtonRef = useRef<HTMLButtonElement>(null);
  const weekPickerRef = useRef<HTMLInputElement>(null);
  const closeAgentSidebar = useCallback(() => setIsAgentSidebarOpen(false), []);

  const [weekYear, weekMonth, weekDay] = weekStartDate.split('-').map(Number);
  const datedEntries = weeklyPreviewEntries.map((entry, index) => {
    const dayOffset = index === 6 ? 0 : index + 1;
    const date = new Date(weekYear, weekMonth - 1, weekDay + dayOffset);
    return {
      ...entry,
      dateLabel: formatDate(date),
    };
  });

  const carouselItems = weeklyPreviewItems.map((item, index) => {
    const entry = datedEntries[index];
    const status = entry.hasData ? 'Data available' : 'No data';
    return {
      ...item,
      subtitle: `${entry.dateLabel} · ${status}`,
    };
  });

  const activeEntry = datedEntries[activeIndex] ?? datedEntries[0];

  // Stop currently playing audio
  const stopAudio = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }
    setIsPlaying(false);
    setIsLoadingAudio(false);
  }, []);

  // Stop playback whenever user slides to a different day
  const handleActiveCarouselChange = (index: number) => {
    stopAudio();
    setActiveIndex(index);
  };

  // Clean up cache object URLs and audio on unmount
  useEffect(() => {
    const cache = audioCacheRef.current;
    return () => {
      stopAudio();
      cache.forEach((url) => URL.revokeObjectURL(url));
      cache.clear();
    };
  }, [stopAudio]);

  const toggleTTS = async () => {
    // If currently playing, pause it
    if (isPlaying && currentAudioRef.current) {
      currentAudioRef.current.pause();
      setIsPlaying(false);
      return;
    }

    // If audio is paused mid-way, resume
    if (currentAudioRef.current && !isPlaying && currentAudioRef.current.currentTime > 0) {
      currentAudioRef.current.play();
      setIsPlaying(true);
      return;
    }

    const textToSpeak = activeEntry.message || `No entries recorded for ${activeEntry.day}.`;
    const cacheKey = `${weekStartDate}-${activeEntry.day}-${textToSpeak}`;

    try {
      setIsLoadingAudio(true);
      let audioUrl = audioCacheRef.current.get(cacheKey);

      if (!audioUrl) {
        const response = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: textToSpeak }),
        });

        if (!response.ok) {
          throw new Error('TTS service failed to synthesize audio.');
        }

        const audioBlob = await response.blob();
        audioUrl = URL.createObjectURL(audioBlob);
        audioCacheRef.current.set(cacheKey, audioUrl);
      }

      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio;

      audio.onended = () => {
        setIsPlaying(false);
        currentAudioRef.current = null;
      };

      audio.onerror = () => {
        setIsPlaying(false);
        setIsLoadingAudio(false);
        currentAudioRef.current = null;
      };

      await audio.play();
      setIsPlaying(true);
    } catch (error) {
      console.error('Failed to play TTS audio:', error);
    } finally {
      setIsLoadingAudio(false);
    }
  };

  const handleWeekDateChange = (value: string) => {
    if (!value) return;

    stopAudio();
    const [year, month, day] = value.split('-').map(Number);
    const chosenDate = new Date(year, month - 1, day);
    chosenDate.setDate(chosenDate.getDate() - chosenDate.getDay());

    setSelectedDate(value);
    setWeekStartDate(
      `${chosenDate.getFullYear()}-${String(chosenDate.getMonth() + 1).padStart(2, '0')}-${String(chosenDate.getDate()).padStart(2, '0')}`,
    );
    setWeekStartLabel(formatDate(chosenDate));
  };

  return (
    <>
      <main
        className="min-h-screen bg-[#fbfaf8] px-5 pb-10 pt-7 text-stone-800 sm:px-10 sm:pb-14 sm:pt-10"
        inert={isAgentSidebarOpen}
      >
        <div className="mx-auto flex min-h-[calc(100vh-4.25rem)] max-w-7xl flex-col">
          <header className="flex items-center justify-between">
            <div className="relative">
              <button
                aria-label="Choose a week"
                className="font-serif text-xl italic tracking-wide transition-colors hover:text-[#887445] focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-stone-700 sm:text-2xl"
                onClick={() => {
                  const picker = weekPickerRef.current;
                  if (!picker) return;
                  if (typeof picker.showPicker === 'function') picker.showPicker();
                  else {
                    picker.focus();
                    picker.click();
                  }
                }}
                type="button"
              >
                Week of {weekStartLabel}
              </button>
              <input
                aria-label="Choose a date in the week"
                className="sr-only"
                onChange={(event) => handleWeekDateChange(event.target.value)}
                ref={weekPickerRef}
                type="date"
                value={selectedDate}
              />
            </div>
            <a
              aria-label="Open profile"
              className="flex h-12 w-12 items-center justify-center rounded-full border border-stone-800 transition-colors hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-stone-700"
              href="profile"
            >
              <svg aria-hidden="true" className="h-7 w-7" fill="none" viewBox="0 0 32 32">
                <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="1.5" />
                <path d="M10 19c1.4 2.1 3.4 3.2 6 3.2s4.6-1.1 6-3.2M11 12.5h.1M21 12.5h.1" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
              </svg>
            </a>
          </header>

          <section
            aria-label="Weekly highlights"
            className="flex flex-1 items-center py-8 sm:py-10 lg:flex-none lg:shrink-0"
          >
            <Carousel items={carouselItems} onActiveChange={handleActiveCarouselChange} />
          </section>

          <section
            aria-label="Agent update"
            className="mx-auto flex w-full max-w-3xl items-end gap-4 pt-4 sm:gap-6 lg:mt-auto"
          >
            <Agent
              buttonRef={agentButtonRef}
              isSidebarOpen={isAgentSidebarOpen}
              onClick={() => setIsAgentSidebarOpen(true)}
            />

            <div className="relative flex-1 lg:min-h-[6rem]">
              <Bubble
                heading={`On ${activeEntry.day}, ${activeEntry.dateLabel}, you ${activeEntry.hasData ? 'achieved…' : 'had a quiet day…'}`}
                text={activeEntry.message}
              />

              <button
                aria-label={isPlaying ? 'Pause spoken summary' : 'Listen to spoken summary'}
                className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white/90 px-3 py-1 text-xs font-medium text-stone-700 shadow-sm backdrop-blur-sm transition-all hover:border-stone-400 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700 disabled:opacity-50"
                disabled={isLoadingAudio}
                onClick={toggleTTS}
                type="button"
              >
                {isLoadingAudio ? (
                  <span>Loading…</span>
                ) : isPlaying ? (
                  <>
                    <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24">
                      <rect height="16" rx="1" width="4" x="6" y="4" />
                      <rect height="16" rx="1" width="4" x="14" y="4" />
                    </svg>
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24">
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                    </svg>
                    <span>Listen</span>
                  </>
                )}
              </button>
            </div>
          </section>
        </div>
      </main>

      <AgentSidebar
        isOpen={isAgentSidebarOpen}
        onClose={closeAgentSidebar}
        triggerRef={agentButtonRef}
      />
    </>
  );
}