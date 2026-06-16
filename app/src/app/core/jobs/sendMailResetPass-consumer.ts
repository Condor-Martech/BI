import { OnQueueActive, OnQueueCompleted, OnQueueFailed, Process, Processor } from "@nestjs/bull";
import { Logger } from "@nestjs/common";
import { Job } from "bull";

import { MailerHttpService } from "../services/mailer-http.service";


@Processor('sendMailResetQueue')
export class SendMailResetConsumer {
  private readonly logger = new Logger(SendMailResetConsumer.name);

  constructor(private mailService: MailerHttpService) { }

  private static logo: string = 'https://institucional.condor.com.br/wp-content/uploads/2024/01/Logo-Grande.png';

  @Process('sendMailResetJob')
  async sendRegister(job: Job) {
    // O endpoint email.z0n.co/send-bi controla o `from` ("Central BI" <web@condor.com.br>).
    // Lançar (não chamar `done(error)`) é o que faz o Bull respeitar attempts/backoff.
    const firstName = job.data.name?.split(' ')[0] ?? 'Olá';
    await this.mailService.sendMail({
      to: job.data.email,
      subject: `${firstName}, sua nova senha de acesso à Plataforma Condor BI`,
      html: await this.emailTemplateSac(job.data),
    });
  }

  @OnQueueActive()
  onActive(job: Job) {
    this.logger.log(`Reset iniciando jobId=${job.id} email=${job.data?.email} attempt=${job.attemptsMade + 1}`);
  }

  @OnQueueCompleted()
  onCompleted(job: Job) {
    this.logger.log(`Reset enviado jobId=${job.id} email=${job.data?.email}`);
  }

  @OnQueueFailed()
  onFailed(job: Job, err: Error) {
    this.logger.error(
      `Reset falhou jobId=${job?.id} email=${job?.data?.email} attempt=${job?.attemptsMade}: ${err.message}`,
      err.stack,
    );
  }
  async emailTemplateSac(data: any) {
    const firstName = data.name?.split(' ')[0] ?? 'Olá';
    const loginUrl = 'https://bi.cndr.me';
    return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional //EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="pt-BR">
${this.head()}
<body style="margin:0;padding:0;background-color:#f5f6f8;color:#1f2937;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <!-- Pre-header invisible: aparece no preview da bandeja de entrada -->
  <div style="display:none;font-size:1px;color:#f5f6f8;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    Sua senha de acesso à Plataforma Condor BI foi redefinida. Confira a nova senha dentro deste e-mail.
  </div>
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f5f6f8;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" class="container" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;box-shadow:0 1px 2px rgba(0,0,0,0.04);">
          <!-- Hero -->
          <tr>
            <td align="center" style="background:#0b479c;padding:36px 24px;">
              <img src="${SendMailResetConsumer.logo}" alt="Condor" width="140" style="display:block;border:0;outline:none;text-decoration:none;height:auto;max-width:140px;" />
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 8px 40px;" class="px">
              <h1 style="margin:0 0 16px 0;font-size:24px;line-height:1.3;font-weight:600;color:#0b479c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                Olá, ${firstName}!
              </h1>
              <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;color:#374151;">
                Sua senha de acesso à <strong>Plataforma Condor BI</strong> foi redefinida com sucesso.
              </p>
              <p style="margin:0 0 24px 0;font-size:16px;line-height:1.6;color:#374151;">
                Use a senha temporária abaixo para entrar na plataforma:
              </p>
            </td>
          </tr>
          <!-- Bloque de password destacado -->
          <tr>
            <td style="padding:0 40px 24px 40px;" class="px">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="background-color:#f9fafb;border:1px dashed #cbd5e1;border-radius:10px;padding:20px 16px;">
                    <p style="margin:0 0 6px 0;font-size:11px;line-height:1.4;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">
                      Sua nova senha
                    </p>
                    <p style="margin:0;font-family:'SFMono-Regular',Menlo,Consolas,'Liberation Mono',monospace;font-size:22px;line-height:1.3;font-weight:600;color:#0b479c;letter-spacing:0.04em;word-break:break-all;">
                      ${data.password}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- CTA bulletproof (VML para Outlook) -->
          <tr>
            <td align="center" style="padding:0 40px 8px 40px;" class="px">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${loginUrl}" style="height:52px;v-text-anchor:middle;width:280px;" arcsize="25%" stroke="f" fillcolor="#df112c">
                <w:anchorlock/>
                <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">Acessar Plataforma</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <a href="${loginUrl}" target="_blank" style="background-color:#df112c;border-radius:12px;color:#ffffff;display:inline-block;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:16px;font-weight:600;line-height:52px;text-align:center;text-decoration:none;width:280px;-webkit-text-size-adjust:none;mso-hide:all;">
                Acessar Plataforma
              </a>
              <!--<![endif]-->
            </td>
          </tr>
          <!-- Recomendação de segurança -->
          <tr>
            <td align="center" style="padding:16px 40px 8px 40px;" class="px">
              <p style="margin:0;font-size:13px;line-height:1.5;color:#6b7280;">
                🔒 Por segurança, recomendamos <strong>alterar esta senha</strong> após o primeiro acesso.
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
                Você não solicitou esta redefinição?
              </h2>
              <p style="margin:0;font-size:14px;line-height:1.6;color:#6b7280;">
                Se você não pediu para redefinir sua senha, entre em contato com o administrador da sua conta imediatamente ou responda esta mensagem.
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
                Você está recebendo este e-mail porque foi solicitada uma redefinição de senha para sua conta.
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
  <title>Sua nova senha — Plataforma Condor BI</title>
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
      body, table { background-color:#f5f6f8 !important; color:#1f2937 !important; }
    }
  </style>
</head>`;
  }
}
