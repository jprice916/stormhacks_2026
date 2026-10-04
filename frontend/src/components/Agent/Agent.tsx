interface AgentProps {
  src?: string;
}

export function Agent({ src = '/assets/agent-placeholder.svg' }: AgentProps) {
  return (
    <div aria-label="Agent" className="flex h-24 w-24 shrink-0 items-end justify-center sm:h-28 sm:w-28" role="img">
      <img alt="" className="h-full w-full object-contain" src={src} />
    </div>
  );
}
