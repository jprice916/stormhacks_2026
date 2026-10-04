import { useEffect, useState } from 'react';
import { BrandMark } from '../components/BrandMark';
import { frontendPaths } from '../lib/paths';
import { loadProfile, type Profile } from '../data/profileApi';

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
      .then((userProfile) => {
        if (active) setProfile(userProfile);
      })
      .catch(() => {
        if (active) setProfile(null);
      })
      .finally(() => {
        if (active) setHasCheckedProfile(true);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="min-h-screen overflow-hidden bg-[#f9f6f1] text-[#473c21]">
      <div className="mx-auto max-w-7xl px-5 sm:px-10">
        <header className="flex items-center justify-between py-6 sm:py-8">
          <a aria-label="Week by week home" className="flex items-center gap-3" href={frontendPaths.home}>
            <BrandMark className="h-10 w-auto object-contain" />
            <span className="font-serif text-xl italic tracking-wide sm:text-2xl">Week by week</span>
          </a>

          <nav aria-label="Main navigation" className="flex items-center gap-4 sm:gap-8">
            <a
              className="hidden items-center justify-center rounded-full border-2 border-[#998350] px-4 py-2 text-sm font-medium text-[#473c21] transition-colors hover:bg-[#eeebe4] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#473c21] sm:inline-flex sm:px-5 sm:text-base"
              href={frontendPaths.weekly}
            >
              My weeks
            </a>

            {/* Dynamic Sign in / Profile status from DB */}
            {hasCheckedProfile && (profile ? (
              <a
                aria-label={`Open ${profile.name}'s profile`}
                className="inline-flex max-w-[12rem] items-center gap-2 rounded-full border-2 border-[#998350] py-1 pl-1 pr-3 text-sm font-medium text-[#473c21] transition-colors hover:bg-[#eeebe4] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#473c21] sm:max-w-[16rem] sm:gap-3 sm:pr-4"
                href={frontendPaths.profile}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#bca880] bg-[#eeebe4] font-serif text-base text-[#887445]">
                  {profile.avatarUrl ? (
                    <img alt="" className="h-full w-full object-cover" src={profile.avatarUrl} />
                  ) : (
                    <span aria-hidden="true">{profile.name.trim().charAt(0).toUpperCase()}</span>
                  )}
                </span>
                <span className="truncate">{profile.name}</span>
              </a>
            ) : (
              <a
                className="rounded-full border-2 border-[#998350] px-4 py-2 text-sm font-medium text-[#473c21] transition-colors hover:bg-[#eeebe4] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#473c21] sm:px-5 sm:text-base"
                href={frontendPaths.login}
              >
                Sign in
              </a>
            ))}
          </nav>
        </header>

        <section className="grid items-center gap-14 pb-20 pt-12 sm:pb-28 sm:pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-20">
          <div className="max-w-2xl">
            <h1 className="max-w-xl font-serif text-[3rem] leading-[1.05] tracking-tight text-[#473c21] sm:text-[3.75rem] lg:text-[4.5rem]">
              Your little moments deserve to be remembered.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-[2.2rem] text-[#887445] sm:text-xl sm:leading-[2.5rem]">
              Every memory should have a special place, you can see them all in this little space.
            </p>

            <div className="mt-9">
              <a
                className="inline-flex min-h-12 items-center justify-center gap-3 rounded-full border-2 border-[#473c21] bg-[#473c21] px-6 py-3 text-base font-medium text-[#f9f6f1] shadow-[3px_3px_0_#b39e6c] transition-colors hover:bg-[#887445] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#473c21]"
                href={profile ? frontendPaths.logger : frontendPaths.login}
              >
                {profile ? 'Open recording studio' : 'Sign in to get started'}
                <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
                  <path d="M4 10h12m-5-5 5 5-5 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
                </svg>
              </a>
            </div>

            <p className="mt-7 text-base text-[#998350] sm:text-lg">No perfect days required. Small steps count, too.</p>
          </div>

          <div className="mx-auto flex w-full max-w-xl justify-center">
            <img
              alt="Hand-drawn smiling face illustration with closed eyes"
              className="h-auto w-full object-contain"
              src={`${import.meta.env.BASE_URL}images/LandPageLogo.gif`}
            />
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
