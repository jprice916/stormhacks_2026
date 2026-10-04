import type { CircularCarouselItem } from './CircularCarousel';
import CircularCarousel from './CircularCarousel';

interface CarouselProps {
  items: CircularCarouselItem[];
  onActiveChange: (index: number) => void;
  onItemClick?: (item: CircularCarouselItem, index: number) => void;
}

export function Carousel({ items, onActiveChange, onItemClick }: CarouselProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="h-[22rem] w-full sm:h-[28rem]">
      <CircularCarousel
        aspectRatio={1}
        autoplay="off"
<<<<<<< HEAD
        cardWidth={275}
=======
        cardWidth={250}
        captions
>>>>>>> origin/DB
        draggable
        focusOnClick
        gap={64}
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
