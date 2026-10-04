import type { CircularCarouselItem } from '../components/Carousel/CircularCarousel';


export interface WeeklyPreviewEntry {
  day: string;
  date: string;
  hasData: boolean;
  message: string;
}

export const weeklyPreviewEntries: WeeklyPreviewEntry[] = [
  {
    day: 'Monday',
    date: 'September 28',
    hasData: true,
    message: 'You finished the first draft of your project outline.',
  },
  {
    day: 'Tuesday',
    date: 'September 29',
    hasData: false,
    message: 'No highlights recorded for this day yet.',
  },
  {
    day: 'Wednesday',
    date: 'September 30',
    hasData: true,
    message: 'You met with your team and turned a rough idea into a clear next step.',
  },
  {
    day: 'Thursday',
    date: 'October 1',
    hasData: false,
    message: 'This slot is using the default state because it has no data.',
  },
  {
    day: 'Friday',
    date: 'October 2',
    hasData: true,
    message:
      'You brought the weekly screen skeleton together, reviewed both slot states, and gave the team something concrete to discuss.',
  },
  {
    day: 'Saturday',
    date: 'October 3',
    hasData: false,
    message: 'No highlights recorded for this day yet.',
  },
  {
    day: 'Sunday',
    date: 'October 4',
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
