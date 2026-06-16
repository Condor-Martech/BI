import {
  OnQueueActive,
  OnQueueCompleted,
  OnQueueFailed,
  Process,
  Processor,
} from "@nestjs/bull";
import { Logger } from "@nestjs/common";
import { Job } from "bull";

import { MailerHttpService } from "../services/mailer-http.service";
import type { WelcomeJobData } from "./sendMailWelcome-producer";

@Processor('sendMailWelcomeQueue')
export class SendMailWelcomeConsumer {
  private readonly logger = new Logger(SendMailWelcomeConsumer.name);

  constructor(private mailService: MailerHttpService) { }

  private static logo: string = 'https://institucional.condor.com.br/wp-content/uploads/2024/01/Logo-Grande.png';

  @Process('sendMailWelcomeJob')
  async sendRegister(job: Job<WelcomeJobData>) {
    // O endpoint email.z0n.co/send-bi controla o `from` ("Central BI" <web@condor.com.br>).
    // Lançar (não chamar `done(error)`) é o que faz o Bull respeitar attempts/backoff.
    await this.mailService.sendMail({
      to: job.data.email,
      subject: `${job.data.name?.split(' ')[0] ?? 'Olá'}, sua conta na Plataforma Condor BI está pronta`,
      html: this.emailTemplate(job.data),
    });
  }

  @OnQueueActive()
  onActive(job: Job<WelcomeJobData>) {
    this.logger.log(`Welcome iniciando jobId=${job.id} email=${job.data?.email} attempt=${job.attemptsMade + 1}`);
  }

  @OnQueueCompleted()
  onCompleted(job: Job<WelcomeJobData>) {
    this.logger.log(`Welcome enviado jobId=${job.id} email=${job.data?.email}`);
  }

  @OnQueueFailed()
  onFailed(job: Job<WelcomeJobData>, err: Error) {
    this.logger.error(
      `Welcome falhou jobId=${job?.id} email=${job?.data?.email} attempt=${job?.attemptsMade}: ${err.message}`,
      err.stack,
    );
  }

  private buildSetPasswordUrl(token: string): string {
    const base = (process.env.BASE_URL ?? '').replace(/\/$/, '');
    return `${base}/set-password/${token}`;
  }

  private emailTemplate(data: WelcomeJobData): string {
    const setPasswordUrl = this.buildSetPasswordUrl(data.token);
    const firstName = data.name?.split(' ')[0] ?? 'Olá';
    return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional //EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="pt-BR">
${this.head()}
<body style="margin:0;padding:0;background-color:#f5f6f8;color:#1f2937;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <!-- Pre-header invisible: aparece no preview da bandeja de entrada -->
  <div style="display:none;font-size:1px;color:#f5f6f8;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    Faltam só alguns segundos para criar sua senha de acesso à Plataforma Condor BI.
  </div>
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f5f6f8;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" class="container" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;box-shadow:0 1px 2px rgba(0,0,0,0.04);">
          <!-- Hero -->
          <tr>
            <td align="center" style="background:#0b479c;padding:36px 24px;">
              <img src="${SendMailWelcomeConsumer.logo}" alt="Condor" width="140" style="display:block;border:0;outline:none;text-decoration:none;height:auto;max-width:140px;" />
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 8px 40px;" class="px">
              <h1 style="margin:0 0 16px 0;font-size:24px;line-height:1.3;font-weight:600;color:#0b479c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                Olá, ${firstName}!
              </h1>
              <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;color:#374151;">
                Sua conta na <strong>Plataforma Condor BI</strong> foi criada com sucesso.
              </p>
              <p style="margin:0 0 24px 0;font-size:16px;line-height:1.6;color:#374151;">
                Para começar a acessar seus relatórios, defina sua senha clicando no botão abaixo:
              </p>
            </td>
          </tr>
          <!-- CTA bulletproof (VML para Outlook) -->
          <tr>
            <td align="center" style="padding:0 40px 8px 40px;" class="px">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${setPasswordUrl}" style="height:52px;v-text-anchor:middle;width:280px;" arcsize="25%" stroke="f" fillcolor="#df112c">
                <w:anchorlock/>
                <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">Definir minha senha</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <a href="${setPasswordUrl}" target="_blank" style="background-color:#df112c;border-radius:12px;color:#ffffff;display:inline-block;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:16px;font-weight:600;line-height:52px;text-align:center;text-decoration:none;width:280px;-webkit-text-size-adjust:none;mso-hide:all;">
                Definir minha senha
              </a>
              <!--<![endif]-->
            </td>
          </tr>
          <!-- Expiração -->
          <tr>
            <td align="center" style="padding:16px 40px 8px 40px;" class="px">
              <p style="margin:0;font-size:13px;line-height:1.5;color:#6b7280;">
                ⏱ Este link expira em <strong>48 horas</strong>.
              </p>
            </td>
          </tr>
          <!-- Fallback URL -->
          <tr>
            <td style="padding:24px 40px 8px 40px;" class="px">
              <p style="margin:0 0 8px 0;font-size:13px;line-height:1.5;color:#6b7280;">
                Se o botão não funcionar, copie e cole este endereço no navegador:
              </p>
              <p style="margin:0;font-size:13px;line-height:1.5;color:#0b479c;word-break:break-all;">
                <a href="${setPasswordUrl}" style="color:#0b479c;text-decoration:underline;">${setPasswordUrl}</a>
              </p>
            </td>
          </tr>
          <!-- Divisor -->
          <tr>
            <td style="padding:32px 40px 0 40px;" class="px">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr><td style="border-top:1px solid #e5e7eb;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>
          <!-- Ajuda -->
          <tr>
            <td style="padding:24px 40px 40px 40px;" class="px">
              <h2 style="margin:0 0 8px 0;font-size:14px;line-height:1.4;font-weight:600;color:#1f2937;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                Precisa de ajuda?
              </h2>
              <p style="margin:0;font-size:14px;line-height:1.6;color:#6b7280;">
                Se você não esperava receber este e-mail ou tem dificuldade para acessar, fale com o administrador da sua conta ou responda esta mensagem.
              </p>
            </td>
          </tr>
        </table>
        <!-- Footer -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;width:100%;">
          <tr>
            <td align="center" style="padding:24px 16px;">
              <p style="margin:0 0 4px 0;font-size:12px;line-height:1.5;color:#9ca3af;">
                Plataforma Condor BI · Condor S.A.
              </p>
              <p style="margin:0;font-size:12px;line-height:1.5;color:#9ca3af;">
                Você está recebendo este e-mail porque um administrador criou uma conta para você.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  private head(): string {
    return `<head>
  <!--[if gte mso 9]>
  <xml>
    <o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings>
  </xml>
  <![endif]-->
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <!--[if !mso]><!--><meta http-equiv="X-UA-Compatible" content="IE=edge"><!--<![endif]-->
  <title>Defina sua senha — Plataforma Condor BI</title>
  <style type="text/css">
    body, table, td, p, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; border-collapse:collapse; }
    img { -ms-interpolation-mode:bicubic; border:0; outline:none; text-decoration:none; }
    a[x-apple-data-detectors] { color:inherit !important; text-decoration:none !important; }
    @media screen and (max-width: 600px) {
      .container { width:100% !important; border-radius:0 !important; border-left:0 !important; border-right:0 !important; }
      .px { padding-left:24px !important; padding-right:24px !important; }
      h1 { font-size:22px !important; }
    }
    @media (prefers-color-scheme: dark) {
      /* Forçamos light mode no <meta color-scheme> acima; este bloco só protege contra clients que ignoram a meta. */
      body, table { background-color:#f5f6f8 !important; color:#1f2937 !important; }
    }
  </style>
</head>`;
  }
}
