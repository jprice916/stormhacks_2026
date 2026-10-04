import { useCallback, useRef, useState } from 'react';
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
  const [isAgentSidebarOpen, setIsAgentSidebarOpen] = useState(false);
  const agentButtonRef = useRef<HTMLButtonElement>(null);
  const weekPickerRef = useRef<HTMLInputElement>(null);
  const closeAgentSidebar = useCallback(() => setIsAgentSidebarOpen(false), []);

  const [year, month, day] = selectedDate.split('-').map(Number);
  const weekStartDate = new Date(year, month - 1, day);
  weekStartDate.setDate(weekStartDate.getDate() - ((weekStartDate.getDay() + 6) % 7));

  const datedEntries = weeklyPreviewEntries.map((entry, index) => {
    const date = new Date(weekStartDate);
    date.setDate(weekStartDate.getDate() + index);
    return { ...entry, dateLabel: formatDate(date) };
  });
  const carouselItems = weeklyPreviewItems.map((item, index) => {
    const entry = datedEntries[index];
    return {
      ...item,
      subtitle: `${entry.dateLabel} · ${entry.hasData ? 'Data available' : 'No data'}`,
    };
  });
  const activeEntry = datedEntries[activeIndex] ?? datedEntries[0];

  const handleWeekDateChange = (value: string) => {
    if (value) setSelectedDate(value);
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
                Week of {formatDate(new Date(year, month - 1, day))}
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

          <section aria-label="Weekly highlights" className="flex flex-1 items-center py-8 sm:py-10">
            <Carousel items={carouselItems} onActiveChange={setActiveIndex} />
          </section>

          <section aria-label="Agent update" className="mx-auto flex w-full max-w-3xl items-end gap-4 sm:gap-6">
            <Agent
              buttonRef={agentButtonRef}
              isSidebarOpen={isAgentSidebarOpen}
              onClick={() => setIsAgentSidebarOpen(true)}
            />
            <Bubble
              heading={`On ${activeEntry.day}, ${activeEntry.dateLabel}, you ${activeEntry.hasData ? 'achieved…' : 'had a quiet day…'}`}
              text={activeEntry.message}
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
