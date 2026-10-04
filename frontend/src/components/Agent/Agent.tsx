import type { Ref } from 'react';

interface AgentProps {
  src?: string;
  isSidebarOpen: boolean;
  onClick: () => void;
  buttonRef: Ref<HTMLButtonElement>;
}

export function Agent({
  src = `${import.meta.env.BASE_URL}assets/agent-placeholder.svg`,
  isSidebarOpen,
  onClick,
  buttonRef,
}: AgentProps) {
  return (
    <button
      aria-controls="agent-sidebar"
      aria-expanded={isSidebarOpen}
      aria-label="Open Agent menu"
      className="flex h-24 w-24 shrink-0 cursor-pointer items-end justify-center rounded-full transition-transform duration-200 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-stone-700 active:scale-95 sm:h-28 sm:w-28"
      onClick={onClick}
      ref={buttonRef}
      type="button"
    >
      <img alt="" className="h-full w-full object-contain" src={src} />
    </button>
  );
}
