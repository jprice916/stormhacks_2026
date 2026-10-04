interface BubbleProps {
  heading: string;
  text: string;
}

export function Bubble({ heading, text }: BubbleProps) {
  return (
    <section
      aria-live="polite"
      className="relative w-fit max-w-full rounded-[1.6rem] border border-stone-800 bg-white px-6 py-5 text-stone-800 shadow-sm before:absolute before:-left-2 before:bottom-5 before:h-4 before:w-4 before:rotate-45 before:border-b before:border-l before:border-stone-800 before:bg-white before:content-[''] sm:max-w-2xl sm:px-8 sm:py-6"
    >
      <h2 className="font-serif text-lg italic leading-snug sm:text-xl">{heading}</h2>
      <p className="mt-2 max-w-prose break-words text-base leading-relaxed sm:text-lg">{text}</p>
    </section>
  );
}
