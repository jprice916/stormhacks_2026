import { useEffect, useState } from 'react';
import { loadProfile, type Profile } from '../data/profileApi';

const weeklyMoments = [
  { day: 'MON', moment: 'A new idea', tone: 'bg-[#eeebe4]' },
  { day: 'WED', moment: 'A good pause', tone: 'bg-[#ddd5c3]' },
  { day: 'FRI', moment: 'Kept going', tone: 'bg-[#cbbe9f]' },
] as const;

const steps = [
  {
    number: '01',
    title: 'Notice the little things',
    description: 'Keep the small wins, bright moments, and steps forward that make up your week.',
  },
  {
    number: '02',
    title: 'Let your week take shape',
    description: 'Your moments gather into a gentle snapshot you can explore at your own pace.',
  },
  {
    number: '03',
    title: 'Look back with kindness',
    description: 'See how far you have come, one ordinary and extraordinary week at a time.',
  },
] as const;

export function LandingPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [hasCheckedProfile, setHasCheckedProfile] = useState(false);

  useEffect(() => {
    let active = true;
    loadProfile()
      .then((userProfile) => { if (active) setProfile(userProfile); })
      .catch(() => { if (active) setProfile(null); })
      .finally(() => { if (active) setHasCheckedProfile(true); });
    return () => { active = false; };
  }, []);

  return (
    <main className="min-h-screen overflow-hidden bg-[#f9f6f1] text-[#473c21]">
      <div className="mx-auto max-w-7xl px-5 sm:px-10">
        <header className="flex items-center justify-between py-6 sm:py-8">
          <a aria-label="Week by week home" className="flex items-center gap-3" href="/">
            <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#473c21] bg-[#473c21] text-[#f9f6f1]">
              <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
                <path
                  d="M12 3.5v3m0 11v3m8.5-8.5h-3m-11 0h-3m13.01-6.01-2.12 2.12m-7.78 7.78-2.12 2.12m12.02 0-2.12-2.12m-7.78-7.78L5.49 5.99"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="1.5"
                />
                <circle cx="12" cy="12" r="3.25" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </span>
            <span className="font-serif text-xl italic tracking-wide sm:text-2xl">Week by week</span>
          </a>

          <nav aria-label="Main navigation" className="flex items-center gap-4 sm:gap-8">
            <a
              className="hidden text-sm text-[#887445] transition-colors hover:text-[#473c21] sm:inline"
              href="#how-it-works"
            >
              How it works
            </a>
            <a
              className="hidden text-sm text-[#887445] transition-colors hover:text-[#473c21] md:inline"
              href="/weekly"
            >
              Carousel preview
            </a>
            <a
              className="hidden text-sm text-[#887445] transition-colors hover:text-[#473c21] sm:inline"
              href="/profile"
            >
              Profile
            </a>
            {hasCheckedProfile && (profile ? (
              <a
                aria-label={`Open ${profile.name}'s profile`}
                className="inline-flex max-w-[12rem] items-center gap-2 rounded-full border-2 border-[#998350] py-1 pl-1 pr-3 text-sm font-medium text-[#473c21] transition-colors hover:bg-[#eeebe4] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#473c21] sm:max-w-[16rem] sm:gap-3 sm:pr-4"
                href="/profile"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#bca880] bg-[#eeebe4] font-serif text-base text-[#887445]">
                  {profile.avatarUrl
                    ? <img alt="" className="h-full w-full object-cover" src={profile.avatarUrl} />
                    : <span aria-hidden="true">{profile.name.trim().charAt(0).toUpperCase()}</span>}
                </span>
                <span className="truncate">{profile.name}</span>
              </a>
            ) : (
              <a
                className="rounded-full border-2 border-[#998350] px-4 py-2 text-sm font-medium text-[#473c21] transition-colors hover:bg-[#eeebe4] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#473c21] sm:px-5"
                href="/login"
              >
                Sign in
              </a>
            ))}
          </nav>
        </header>

        <section className="grid items-center gap-14 pb-20 pt-12 sm:pb-28 sm:pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-20">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 rounded-full border-2 border-[#bca880] bg-[#eeebe4] px-4 py-2 text-xs font-medium uppercase tracking-[0.17em] text-[#887445]">
              A gentle space for your progress
            </p>
            <h1 className="mt-7 max-w-xl font-serif text-5xl leading-[1.05] tracking-tight text-[#473c21] sm:text-6xl lg:text-7xl">
              Your little moments deserve to be remembered.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-[#887445] sm:text-lg sm:leading-8">
              Gather the bright spots, the small wins, and the steps forward. At the end of the week, see them all in one warm place.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                className="inline-flex min-h-12 items-center justify-center gap-3 rounded-full border-2 border-[#473c21] bg-[#473c21] px-6 py-3 text-sm font-medium text-[#f9f6f1] shadow-[3px_3px_0_#b39e6c] transition-colors hover:bg-[#887445] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#473c21]"
                href={profile ? '/logger' : '/login'}
              >
                {profile ? 'Open recording studio' : 'Sign in to get started'}
                <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
                  <path d="M4 10h12m-5-5 5 5-5 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
                </svg>
              </a>
              <a
                className="inline-flex min-h-12 items-center justify-center rounded-full px-6 py-3 text-sm font-medium text-[#887445] transition-colors hover:text-[#473c21] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#473c21]"
                href="/weekly"
              >
                Explore the carousel preview
              </a>
            </div>
            <p className="mt-7 text-sm text-[#998350]">No perfect days required. Small steps count, too.</p>
          </div>

          <div aria-label="Weekly reflection preview" className="relative mx-auto w-full max-w-xl">
            <article className="relative rotate-1 rounded-[2rem] border-2 border-[#473c21] bg-[#f9f6f1] p-5 shadow-[7px_7px_0_#b39e6c] sm:p-8">
              <header className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#887445]">Your weekly note</p>
                  <h2 className="mt-2 font-serif text-2xl italic text-[#473c21] sm:text-3xl">A week to keep</h2>
                </div>
                <span className="rounded-full border border-[#bca880] bg-[#eeebe4] px-3 py-1.5 text-xs font-medium tracking-wide text-[#887445]">
                  OCT 02 — 08
                </span>
              </header>

              <div className="mt-7 grid grid-cols-3 gap-3 sm:gap-4">
                {weeklyMoments.map((item) => (
                  <div
                    className={`flex aspect-[4/5] flex-col rounded-2xl p-3 sm:p-4 ${item.tone}`}
                    key={item.day}
                  >
                    <span className="text-[0.65rem] font-medium tracking-[0.16em] text-[#887445]">{item.day}</span>
                    <span aria-hidden="true" className="mt-4 flex h-9 w-9 items-center justify-center rounded-full border border-[#998350] bg-[#f9f6f1] text-lg text-[#998350]">
                      ✳
                    </span>
                    <span className="mt-auto pt-3 font-serif text-sm leading-5 text-[#473c21] sm:text-base">
                      {item.moment}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex items-start gap-3 rounded-2xl border border-[#ddd5c3] bg-[#eeebe4] p-4 sm:mt-6 sm:p-5">
                <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#473c21] bg-[#bca880] text-[#473c21]">
                  <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <path d="M7.5 15.5c-1.25-.9-2-2.3-2-3.9a6.5 6.5 0 0 1 13 0c0 1.6-.75 3-2 3.9-.6.45-1 1.15-1 1.9h-7c0-.75-.4-1.45-1-1.9ZM9.5 20h5m-4.5-2.6h4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
                  </svg>
                </span>
                <div>
                  <p className="font-serif text-base italic text-[#473c21] sm:text-lg">Look how far you came.</p>
                  <p className="mt-1 text-xs leading-5 text-[#887445] sm:text-sm">
                    A quiet reminder from your Agent, for the days you need one.
                  </p>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between text-xs text-[#998350] sm:text-sm">
                <span>3 moments saved</span>
                <span className="flex gap-1.5" aria-hidden="true">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#887445]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-[#bca880]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-[#bca880]" />
                </span>
              </div>
            </article>
          </div>
        </section>

        <section className="border-t border-[#ddd5c3] py-16 sm:py-20" id="how-it-works">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#887445]">A softer kind of progress</p>
            <h2 className="mt-4 font-serif text-3xl leading-tight text-[#473c21] sm:text-4xl">
              Make room for the good stuff.
            </h2>
          </div>
          <div className="mt-10 grid gap-4 sm:mt-12 sm:grid-cols-3 sm:gap-5">
            {steps.map((step) => (
              <article className="rounded-3xl border-2 border-[#bca880] bg-[#eeebe4] p-6 sm:p-7" key={step.number}>
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[#473c21] bg-[#cbbe9f] font-serif text-sm text-[#473c21]">
                  {step.number}
                </span>
                <h3 className="mt-5 font-serif text-xl text-[#473c21]">{step.title}</h3>
                <p className="mt-3 text-sm leading-6 text-[#887445]">{step.description}</p>
              </article>
            ))}
          </div>
        </section>

        <footer className="flex flex-col gap-3 border-t border-[#ddd5c3] py-6 text-sm text-[#998350] sm:flex-row sm:items-center sm:justify-between">
          <span className="font-serif italic text-[#887445]">Week by week</span>
          <span>A calm place to notice how far you have come.</span>
        </footer>
      </div>
    </main>
  );
}
