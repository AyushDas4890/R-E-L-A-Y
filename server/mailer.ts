// The one place that knows how email leaves the server. Everything else talks to `EmailProvider`,
// so a real provider is one more entry in PROVIDERS and no change anywhere else.
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailProvider {
  name: string;
  send(message: EmailMessage): Promise<void>;
}

// For local development: prints instead of sending. The address is masked so logs don't collect them.
export function consoleProvider(log: (line: string) => void = console.log): EmailProvider {
  return {
    name: 'console',
    async send({ to, subject, text }) {
      const [local = '', domain = ''] = to.split('@');
      log(`[email to ${local.slice(0, 1)}***@${domain}] ${subject}\n${text}`);
    },
  };
}

// Resend over its HTTP API, so no SDK is needed. `fetchImpl` is injectable for tests.
export function resendProvider(opts: { apiKey: string; from: string; fetchImpl?: typeof fetch }): EmailProvider {
  const doFetch = opts.fetchImpl ?? fetch;
  return {
    name: 'resend',
    async send({ to, subject, text }) {
      const res = await doFetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${opts.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: opts.from, to: [to], subject, text }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        // Resend explains refusals in a `message` field; the status alone is enough if it isn't JSON.
        const detail = await res.json().then((b: { message?: unknown }) => (typeof b.message === 'string' ? `: ${b.message}` : ''), () => '');
        throw new Error(`resend ${res.status}${detail}`);
      }
    },
  };
}

// Real providers are added here, each built from env var names only (never values in code).
// A factory returns null when its settings are missing, which leaves email off.
const PROVIDERS: Record<string, (env: NodeJS.ProcessEnv) => EmailProvider | null> = {
  console: () => consoleProvider(),
  resend: (env) => {
    const apiKey = env.RESEND_API_KEY?.trim();
    const from = env.RELAY_EMAIL_FROM?.trim();
    if (apiKey && from) return resendProvider({ apiKey, from });
    console.warn('RELAY_EMAIL_PROVIDER=resend needs RESEND_API_KEY and RELAY_EMAIL_FROM: email notifications are off.');
    return null;
  },
};

// Email is off unless RELAY_EMAIL_PROVIDER names a known provider.
export function createMailer(env: NodeJS.ProcessEnv = process.env): EmailProvider | null {
  const name = env.RELAY_EMAIL_PROVIDER?.trim();
  if (!name) return null;
  const make = PROVIDERS[name];
  if (!make) {
    console.warn(`Unknown RELAY_EMAIL_PROVIDER "${name}": email notifications are off. Known: ${Object.keys(PROVIDERS).join(', ')}.`);
    return null;
  }
  return make(env);
}
