interface BubbleProps {
  heading: string;
  text: string;
}

function truncateSummary(text: string, maxLength = 240) {
  if (text.length <= maxLength) return text;
  const cutAt = text.lastIndexOf(' ', maxLength);
  return `${text.slice(0, cutAt > 0 ? cutAt : maxLength).trimEnd()}…`;
}

export function Bubble({ heading, text }: BubbleProps) {
  const displayedText = truncateSummary(text);

  return (
    <section
      aria-live="polite"
      className="relative h-40 w-full overflow-hidden rounded-[1.6rem] border border-stone-800 bg-white px-6 py-5 text-stone-800 shadow-sm before:absolute before:-left-2 before:bottom-5 before:h-4 before:w-4 before:rotate-45 before:border-b before:border-l before:border-stone-800 before:bg-white before:content-[''] sm:px-8 sm:py-6"
    >
      <h2 className="font-serif text-lg italic leading-snug sm:text-xl">{heading}</h2>
      <p
        className="mt-2 break-words text-base leading-relaxed sm:text-lg"
        style={{
          display: '-webkit-box',
          overflow: 'hidden',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: 2,
        }}
      >
        {displayedText}
      </p>
    </section>
  );
}
