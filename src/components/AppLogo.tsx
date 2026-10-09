/** Trichter-Logo von Magnetic_CRM (gleiche Form wie App-Icon und Favicon). */
export function AppLogo({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true">
      <rect width="512" height="512" rx="112" fill="var(--brand)" />
      <path d="M110 140H402L367.3 181H144.7Z M156.5 195H355.5L292 270V372L220 404V270Z" fill="#fff" />
    </svg>
  );
}
