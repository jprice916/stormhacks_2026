import { useState } from 'react';
import { Agent } from './components/Agent/Agent';
import { Bubble } from './components/Bubble/Bubble';
import { Carousel } from './components/Carousel/Carousel';
import { weeklyPreviewEntries, weeklyPreviewItems } from './data/weeklyPreview';

function App() {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeEntry = weeklyPreviewEntries[activeIndex] ?? weeklyPreviewEntries[0];

  return (
    <main className="min-h-screen bg-[#fbfaf8] px-5 pb-10 pt-7 text-stone-800 sm:px-10 sm:pb-14 sm:pt-10">
      <div className="mx-auto flex min-h-[calc(100vh-4.25rem)] max-w-7xl flex-col">
        <header className="flex items-center justify-between">
          <p className="font-serif text-xl italic tracking-wide sm:text-2xl">Week of October 2</p>
          <button
            aria-label="Open account menu"
            className="flex h-12 w-12 items-center justify-center rounded-full border border-stone-800 transition-colors hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-stone-700"
            type="button"
          >
            <svg aria-hidden="true" className="h-7 w-7" fill="none" viewBox="0 0 32 32">
              <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10 19c1.4 2.1 3.4 3.2 6 3.2s4.6-1.1 6-3.2M11 12.5h.1M21 12.5h.1" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
            </svg>
          </button>
        </header>

        <section aria-label="Weekly highlights" className="flex flex-1 items-center py-8 sm:py-10">
          <Carousel items={weeklyPreviewItems} onActiveChange={setActiveIndex} />
        </section>

        <section aria-label="Agent update" className="mx-auto flex w-full max-w-3xl items-end gap-4 sm:gap-6">
          <Agent />
          <Bubble
            heading={`On ${activeEntry.day}, you ${activeEntry.hasData ? 'achieved…' : 'had a quiet day…'}`}
            text={activeEntry.message}
          />
        </section>
      </div>
    </main>
  );
}

export default App;
