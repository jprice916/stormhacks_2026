import type { CircularCarouselItem } from '../components/Carousel/CircularCarousel';

export const weekDayNames = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export const weeklyCarouselTemplates: CircularCarouselItem[] = weekDayNames.map((day) => ({
  src: `${import.meta.env.BASE_URL}assets/empty-state.svg`,
  alt: `${day} journal highlights`,
  title: day,
}));

export async function loadWeeklyTakeaways(weekStart: string): Promise<Record<string, string[]>> {
  const response = await fetch(`/api/journal/takeaways?week_start=${encodeURIComponent(weekStart)}`, {
    credentials: 'same-origin',
  });
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error(`The journal service returned an unexpected response (HTTP ${response.status}). Restart Flask if this route was just added.`);
  }
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.message || 'Journal highlights could not be loaded.');
  }
  return result.takeaways as Record<string, string[]>;
}
