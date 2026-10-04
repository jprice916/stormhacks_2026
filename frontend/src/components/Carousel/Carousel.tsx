import type { CircularCarouselItem } from './CircularCarousel';
import CircularCarousel from './CircularCarousel';

interface CarouselProps {
  items: CircularCarouselItem[];
  onActiveChange: (index: number) => void;
}

export function Carousel({ items, onActiveChange }: CarouselProps) {
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
        items={items}
        onChange={onActiveChange}
        perspective={1300}
        snap
        tilt={-5}
      />
    </div>
  );
}
