import { useEffect, useRef, type RefObject } from 'react';
import { frontendPaths } from '../../lib/paths';

const agentNavigationItems = [
  { label: 'Logger', href: frontendPaths.logger },
  { label: 'Milestones', href: undefined },
  { label: 'Settings', href: frontendPaths.voiceSettings },
] as const;

interface AgentSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}

export function AgentSidebar({ isOpen, onClose, triggerRef }: AgentSidebarProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const panel = panelRef.current;
      if (!panel) {
        return;
      }

      const focusableElements = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (!firstElement || !lastElement) {
        event.preventDefault();
        return;
      }

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      triggerRef.current?.focus();
    };
  }, [isOpen, onClose, triggerRef]);

  return (
    <div
      aria-hidden={!isOpen}
      className={`fixed inset-0 z-50 bg-stone-950/35 backdrop-blur-[2px] transition-opacity duration-300 ${isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
      inert={!isOpen}
      onClick={onClose}
    >
      <div
        aria-labelledby="agent-sidebar-title"
        aria-modal="true"
        className={`absolute inset-y-0 right-0 flex w-[min(90vw,28rem)] flex-col border-l border-stone-300 bg-[#fbfaf8] p-6 shadow-2xl transition-transform duration-300 ease-out sm:w-1/2 sm:p-10 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        id="agent-sidebar"
        ref={panelRef}
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-6 border-b border-stone-300 pb-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-500">Navigation</p>
            <h2 className="mt-2 font-serif text-3xl italic text-stone-800" id="agent-sidebar-title">
              Your Agent
            </h2>
          </div>
          <button
            aria-label="Close Agent menu"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-stone-400 transition-colors hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-stone-700"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
              <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
            </svg>
          </button>
        </header>

        <nav aria-label="Agent navigation" className="mt-8">
          <ul className="grid grid-cols-3 gap-3">
            {agentNavigationItems.map((item) => (
              <li key={item.label}>
                {item.href ? (
                  <a
                    className="flex aspect-square w-full items-center justify-center rounded-xl border border-stone-400 bg-white px-2 text-center text-xs font-medium text-stone-700 shadow-sm transition-colors hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700 sm:text-base"
                    href={item.href}
                  >
                    {item.label}
                  </a>
                ) : (
                  <button
                    className="flex aspect-square w-full items-center justify-center rounded-xl border border-stone-300 bg-white px-2 text-center text-xs font-medium text-stone-700 shadow-sm disabled:cursor-not-allowed sm:text-base"
                    disabled
                    type="button"
                  >
                    {item.label}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </nav>

        <footer className="mt-auto border-t border-stone-300 pt-6">
          <button
            className="w-full rounded-xl border border-stone-400 px-5 py-3 text-left text-sm font-medium text-stone-700 disabled:cursor-not-allowed sm:text-base"
            disabled
            type="button"
          >
            Logout
          </button>
        </footer>
      </div>
    </div>
  );
}
