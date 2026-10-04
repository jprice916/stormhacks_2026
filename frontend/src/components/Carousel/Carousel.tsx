import type { CircularCarouselItem } from './CircularCarousel';
import CircularCarousel from './CircularCarousel';

interface CarouselProps {
  items: CircularCarouselItem[];
  initialIndex?: number;
  onActiveChange: (index: number) => void;
  onItemClick?: (item: CircularCarouselItem, index: number) => void;
}

export function Carousel({ items, initialIndex, onActiveChange, onItemClick }: CarouselProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="relative left-1/2 h-[24rem] w-[calc(100vw-1.5rem)] max-w-[110rem] -translate-x-1/2 sm:h-[32rem] sm:w-[calc(100vw-3rem)]">
      <CircularCarousel
        aspectRatio={1}
        autoplay="off"
        cardWidth={360}
        draggable
        focusOnClick
        gap={120}
        initialIndex={initialIndex}
        items={items}
        onChange={onActiveChange}
        onItemClick={onItemClick}
        perspective={1300}
        snap
        tilt={-5}
      />
    </div>
  );
}
