import 'server-only';
import nodemailer from 'nodemailer';

/**
 * SMTP-Zugangsdaten kommen ausschliesslich aus Server-Umgebungsvariablen,
 * damit keine Passwoerter in der Datenbank liegen:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE
 * Funktioniert mit Gmail-App-Passwoertern, Microsoft 365 und jedem
 * klassischen SMTP-Postfach.
 */
export function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function sendMail(options: {
  from: string;
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}) {
  if (!smtpConfigured()) {
    throw new Error(
      'SMTP ist nicht konfiguriert. Bitte SMTP_HOST, SMTP_USER und SMTP_PASS in der Umgebung setzen.',
    );
  }

  const port = Number(process.env.SMTP_PORT ?? 587);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
  });

  await transporter.sendMail({
    from: options.from,
    to: options.to,
    subject: options.subject,
    text: options.text,
    replyTo: options.replyTo,
  });
}

/** Platzhalter wie {{vorname}} in Vorlagen ersetzen. */
export function renderTemplate(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => vars[key.toLowerCase()] ?? '');
}
