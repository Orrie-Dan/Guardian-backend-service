import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return env;
}

const env = loadEnv(resolve(process.cwd(), '.env'));
const apiKey =
  env.SENDGRID_API_KEY?.trim() ||
  (env.EMAIL_PROVIDER === 'sendgrid' ? env.SMTP_PASS?.trim() : undefined);
const from = env.SMTP_FROM?.trim();
const to = process.argv[2]?.trim() || from;

console.log('SendGrid config (redacted):');
console.log(`  apiKey=${apiKey ? '[set]' : '(missing)'}`);
console.log(`  from=${from ?? '(missing)'}`);
console.log(`  to=${to ?? '(missing)'}`);

if (!apiKey || !from || !to) {
  console.error(
    '\nFAIL: SENDGRID_API_KEY (or SMTP_PASS with EMAIL_PROVIDER=sendgrid) and SMTP_FROM are required',
  );
  console.error('Usage: node scripts/sendgrid-verify.mjs [recipient@example.com]');
  process.exit(1);
}

const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  body: JSON.stringify({
    personalizations: [{ to: [{ email: to }] }],
    from: { email: from },
    subject: 'G2 Sentry SendGrid verify',
    content: [
      {
        type: 'text/plain',
        value: 'SendGrid API delivery is working.',
      },
    ],
  }),
});

const body = await response.text();

if (response.ok) {
  console.log(`\nOK: SendGrid send succeeded (${response.status})`);
  process.exit(0);
}

console.error(`\nFAIL: SendGrid send failed (${response.status})`);
if (body) {
  console.error(body.slice(0, 1000));
}
process.exit(1);
