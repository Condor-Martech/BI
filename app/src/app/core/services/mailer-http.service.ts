import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError, AxiosInstance } from 'axios';

export interface MailerHttpPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

@Injectable()
export class MailerHttpService {
  private readonly logger = new Logger(MailerHttpService.name);
  private readonly endpoint: string;
  private readonly http: AxiosInstance;

  constructor(private readonly configService: ConfigService) {
    this.endpoint =
      this.configService.get<string>('EMAIL_API_URL') ??
      'https://email.z0n.co/send-bi';
    this.http = axios.create({
      timeout: 15_000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async sendMail(payload: MailerHttpPayload): Promise<string> {
    try {
      const { data } = await this.http.post<string>(this.endpoint, payload);
      return typeof data === 'string' ? data : JSON.stringify(data);
    } catch (err) {
      const error = err as AxiosError;
      const status = error.response?.status ?? 502;
      const detail =
        (error.response?.data as unknown as string) ??
        error.message ??
        'unknown error';
      this.logger.error(
        `Falha ao enviar e-mail via ${this.endpoint} para ${payload.to}: ${status} ${detail}`,
      );
      throw new HttpException(
        `Mailer HTTP falhou: ${detail}`,
        status >= 400 && status < 600 ? status : 502,
      );
    }
  }
}
