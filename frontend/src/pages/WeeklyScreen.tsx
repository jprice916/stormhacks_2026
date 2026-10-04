import { useCallback, useEffect, useRef, useState } from 'react';
import { Agent } from '../components/Agent/Agent';
import { AgentSidebar } from '../components/Agent/AgentSidebar';
import { Bubble } from '../components/Bubble/Bubble';
import { Carousel } from '../components/Carousel/Carousel';
import { loadWeeklySummaries, weekDayNames, weeklyCarouselTemplates, type JournalSummary } from '../data/weeklyJournal';

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' }).format(date);
}

function conciseSummaries(summaries: JournalSummary[]) {
  const text = summaries.map((summary) => summary.concise_summary).filter(Boolean).join(' · ');
  return text.length > 180 ? `${text.slice(0, 177).trimEnd()}…` : text;
}

export function WeeklyScreen() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedDate, setSelectedDate] = useState('2026-10-02');
  const [weekStartDate, setWeekStartDate] = useState('2026-09-27');
  const [weekStartLabel, setWeekStartLabel] = useState('September 27');
  const [summariesByDate, setSummariesByDate] = useState<Record<string, JournalSummary[]>>({});
  const [isLoadingSummaries, setIsLoadingSummaries] = useState(true);
  const [summariesError, setSummariesError] = useState('');
  const [isAgentSidebarOpen, setIsAgentSidebarOpen] = useState(false);
  const agentButtonRef = useRef<HTMLButtonElement>(null);
  const weekPickerRef = useRef<HTMLInputElement>(null);
  const closeAgentSidebar = useCallback(() => setIsAgentSidebarOpen(false), []);

  useEffect(() => {
    let active = true;
    setSummariesByDate({});
    setIsLoadingSummaries(true);
    setSummariesError('');
    loadWeeklySummaries(weekStartDate)
      .then((summaries) => { if (active) setSummariesByDate(summaries); })
      .catch((error: unknown) => {
        if (!active) return;
        setSummariesByDate({});
        setSummariesError(error instanceof Error
          ? error.message
          : 'Journal summaries could not be loaded.');
      })
      .finally(() => { if (active) setIsLoadingSummaries(false); });
    return () => { active = false; };
  }, [weekStartDate]);

  const [weekYear, weekMonth, weekDay] = weekStartDate.split('-').map(Number);
  const datedEntries = weekDayNames.map((day, index) => {
    // The carousel is Monday through Sunday, while weekStartDate is Sunday.
    const dayOffset = index === 6 ? 0 : index + 1;
    const date = new Date(weekYear, weekMonth - 1, weekDay + dayOffset);
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return {
      day,
      dateKey,
      dateLabel: formatDate(date),
      summaries: summariesByDate[dateKey] ?? [],
    };
  });
  const carouselItems = weeklyCarouselTemplates.map((item, index) => {
    const entry = datedEntries[index];
    const status = isLoadingSummaries
      ? 'Checking journal…'
      : summariesError
        ? 'Summaries unavailable'
        : entry.summaries.length
          ? conciseSummaries(entry.summaries)
          : 'Nothing happened';
    return {
      ...item,
      src: `${import.meta.env.BASE_URL}assets/${entry.summaries.length ? 'data-state.svg' : 'empty-state.svg'}`,
      alt: entry.summaries.length ? `${entry.day} with journal summaries` : `${entry.day} with no journal summaries`,
      subtitle: `${entry.dateLabel} · ${status}`,
    };
  });
  const activeEntry = datedEntries[activeIndex] ?? datedEntries[0];

  const handleWeekDateChange = (value: string) => {
    if (!value) return;

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
              href="/static/frontend/profile"
            >
              <svg aria-hidden="true" className="h-7 w-7" fill="none" viewBox="0 0 32 32">
                <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="1.5" />
                <path d="M10 19c1.4 2.1 3.4 3.2 6 3.2s4.6-1.1 6-3.2M11 12.5h.1M21 12.5h.1" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
              </svg>
            </a>
          </header>

          <section aria-label="Weekly highlights" className="flex flex-1 items-center py-8 sm:py-10">
            <Carousel
              items={carouselItems}
              onActiveChange={setActiveIndex}
              onItemClick={(_item, index) => {
                const entry = datedEntries[index];
                if (entry) {
                  window.location.assign(`/static/frontend/recordings?date=${encodeURIComponent(entry.dateKey)}`);
                }
              }}
            />
          </section>

          <section aria-label="Agent update" className="mx-auto flex w-full max-w-3xl items-end gap-4 sm:gap-6">
            <Agent
              buttonRef={agentButtonRef}
              isSidebarOpen={isAgentSidebarOpen}
              onClick={() => setIsAgentSidebarOpen(true)}
            />
            <Bubble
              heading={`Daily summary · ${activeEntry.day}, ${activeEntry.dateLabel}`}
              text={summariesError
                ? summariesError
                : isLoadingSummaries
                  ? 'Checking this day…'
                  : activeEntry.summaries.length
                    ? conciseSummaries(activeEntry.summaries)
                    : 'Nothing happened.'}
            />
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
