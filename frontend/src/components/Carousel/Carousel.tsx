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
    <div className="h-[22rem] w-full sm:h-[28rem]">
      <CircularCarousel
        aspectRatio={1}
        autoplay="off"
        cardWidth={275}
        draggable
        focusOnClick
        gap={64}
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
