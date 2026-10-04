import type { CircularCarouselItem } from '../components/Carousel/CircularCarousel';


export interface WeeklyPreviewEntry {
  day: string;
  hasData: boolean;
  message: string;
}

export const weeklyPreviewEntries: WeeklyPreviewEntry[] = [
  {
    day: 'Monday',
    hasData: true,
    message: 'You finished the first draft of your project outline.',
  },
  {
    day: 'Tuesday',
    hasData: false,
    message: 'No highlights recorded for this day yet.',
  },
  {
    day: 'Wednesday',
    hasData: true,
    message: 'You met with your team and turned a rough idea into a clear next step.',
  },
  {
    day: 'Thursday',
    hasData: false,
    message: 'This slot is using the default state because it has no data.',
  },
  {
    day: 'Friday',
    hasData: true,
    message:
      'You brought the weekly screen skeleton together, reviewed both slot states, and gave the team something concrete to discuss.',
  },
  {
    day: 'Saturday',
    hasData: false,
    message: 'No highlights recorded for this day yet.',
  },
  {
    day: 'Sunday',
    hasData: true,
    message: 'You made space to pause, reflect, and plan the week ahead.',
  },
];

export const weeklyPreviewItems: CircularCarouselItem[] = weeklyPreviewEntries.map((entry) => ({
  src: entry.hasData ? `${import.meta.env.BASE_URL}assets/data-state.svg` : `${import.meta.env.BASE_URL}assets/empty-state.svg`,
  alt: entry.hasData ? 'Preview slot with data' : 'Preview slot with no data',
  title: entry.day,
  subtitle: entry.hasData ? 'Data available' : 'No data',
}));
