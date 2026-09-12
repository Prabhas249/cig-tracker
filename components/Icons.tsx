export function GearIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.3 3.2 10 2h4l-.3 1.2a7.5 7.5 0 0 1 2.2 1.3l1.1-.6 2 3.4-1.1.7a7.6 7.6 0 0 1 0 2.6l1.1.7-2 3.4-1.1-.6a7.5 7.5 0 0 1-2.2 1.3L14 22h-4l.3-1.2a7.5 7.5 0 0 1-2.2-1.3l-1.1.6-2-3.4 1.1-.7a7.6 7.6 0 0 1 0-2.6l-1.1-.7 2-3.4 1.1.6a7.5 7.5 0 0 1 2.2-1.3Z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );
}

export function PlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path strokeLinecap="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function StarIcon({ filled, className }: { filled?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path strokeLinejoin="round" d="m12 3.2 2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.8L6.6 20l1-6-4.4-4.3 6.1-.9Z" />
    </svg>
  );
}

export function SmokeIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={filled ? 2 : 1.5} aria-hidden>
      <path strokeLinecap="round" d="M3.5 16.2h9.2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12.7 15.4h2.6l.9 1.6-.9 1.6h-2.6" />
      <path strokeLinecap="round" d="M16.8 16.2h3.4" />
      <path strokeLinecap="round" d="M19.4 14.2c.4-1.2.2-2.2-.4-3.2M21 13.4c.2-.9 0-1.7-.5-2.6" />
      {filled ? <path d="M3.5 15.3h9.2v1.8H3.5z" fill="currentColor" stroke="none" /> : null}
    </svg>
  );
}

export function AllIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={filled ? 2 : 1.5} aria-hidden>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </svg>
  );
}

export function GlassIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={filled ? 0 : 1.5} aria-hidden>
      <path strokeLinejoin="round" d="M7 4h10l-1.2 9.2a4 4 0 0 1-7.6 0Z" />
      <path strokeLinecap="round" d="M12 13.5V20M9 20h6" />
    </svg>
  );
}
