/* eslint-disable no-console */
/**
 * Triagem do endpoint HTTP de envio de emails. Faz um POST direto contra
 * `EMAIL_API_URL` com a MESMA forma de payload que o `MailerHttpService`
 * usa em produção (welcome / reset password), assim isolamos o transporte
 * do fluxo aplicacional.
 *
 *   npx ts-node scripts/test-mailer-http.ts                    # envia a devnull@example.com
 *   npx ts-node scripts/test-mailer-http.ts foo@bar.com        # envia ao destinatário indicado
 *   npx ts-node scripts/test-mailer-http.ts --to=foo@bar.com   # idem, forma --to=
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';

loadEnv({ path: resolve(__dirname, '..', '.env') });

const REQUIRED = ['EMAIL_API_URL'] as const;

function resolveRecipient(): string {
  const args = process.argv.slice(2);
  const toArg = args.find((a) => a.startsWith('--to='));
  if (toArg) return toArg.split('=')[1] ?? 'devnull@example.com';
  return args[0] ?? 'devnull@example.com';
}

async function main(): Promise<void> {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`[mailer-http-test] envs ausentes: ${missing.join(', ')}`);
    process.exit(1);
  }

  const endpoint = process.env.EMAIL_API_URL!.replace(/\/$/, '');
  const to = resolveRecipient();

  const payload = {
    to,
    subject: '[BI] Teste do MailerHttpService',
    html: `<p>Mensagem de teste enviada via scripts/test-mailer-http.ts em ${new Date().toISOString()}.</p>`,
  };

  console.log(`[mailer-http-test] endpoint=${endpoint}`);
  console.log(`[mailer-http-test] destinatario=${to}`);
  console.log(`[mailer-http-test] payload=`, payload);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = await res.text();
  console.log(`[mailer-http-test] status=${res.status}`);
  console.log(`[mailer-http-test] body=${body}`);

  if (!res.ok) {
    console.error('[mailer-http-test] FAILED');
    process.exit(2);
  }
  console.log('[mailer-http-test] OK');
}

main().catch((err) => {
  console.error('[mailer-http-test] FAILED');
  console.error(err);
  process.exit(3);
});
