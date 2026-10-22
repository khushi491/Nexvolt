export function Logo({ inverse = false }: { inverse?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-2 text-lg font-bold tracking-tight ${inverse ? 'text-white' : 'text-navy'}`}
    >
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="9" fill={inverse ? '#FFFFFF' : '#101F35'} />
        <path d="M18 5 9 18h6l-2 9 10-14h-6l1-8Z" fill="#12B8A6" />
      </svg>
      <span>
        Nex<span className="text-teal">volt</span>
      </span>
    </span>
  );
}
