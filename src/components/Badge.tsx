export function Badge({
  children, color, tone,
}: { children: React.ReactNode; color?: string; tone?: 'win' | 'lose' | 'warn' | 'muted' }) {
  if (color) {
    return (
      <span className="chip" style={{ background: `${color}1f`, color }}>
        {children}
      </span>
    );
  }
  const cls =
    tone === 'win' ? 'bg-win/15 text-win'
    : tone === 'lose' ? 'bg-lose/15 text-lose'
    : tone === 'warn' ? 'bg-warn/15 text-warn'
    : 'bg-surface-2 text-muted';
  return <span className={`chip ${cls}`}>{children}</span>;
}
