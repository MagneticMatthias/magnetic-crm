// Laeuft einmal beim Serverstart. Startet den Anrufmonitor der Fritzbox.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.FRITZBOX_ANRUFMONITOR === '0') return;
  const { startAnrufmonitor } = await import('./lib/fritz');
  startAnrufmonitor();
}
