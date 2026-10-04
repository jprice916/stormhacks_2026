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
  src: `${import.meta.env.BASE_URL}images/weekly/no_data.gif`,
  alt: `${day} journal highlights`,
  title: day,
}));

export type JournalSummary = {
  concise_summary: string;
  full_summary: string;
};

export async function loadWeeklySummaries(weekStart: string): Promise<Record<string, JournalSummary[]>> {
  const response = await fetch(`/api/journal/summaries?week_start=${encodeURIComponent(weekStart)}`, {
    credentials: 'same-origin',
  });
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error(`The journal summaries service returned an unexpected response (HTTP ${response.status}). Restart Flask if this route was just added.`);
  }
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.message || 'Journal summaries could not be loaded.');
  }
  return result.entries_by_date as Record<string, JournalSummary[]>;
}
