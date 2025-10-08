import { Injectable } from '@nestjs/common';
import axios, { AxiosError, AxiosInstance } from 'axios';
import { toError } from '../common/utils/bctypto';

type InfobipSmsStatus = {
  groupId: number;
  groupName: string;
  id: number;
  name: string;
  description: string;
};

type InfobipSmsMessageResult = {
  to: string;
  messageId?: string;
  status: InfobipSmsStatus;
};

export type InfobipSmsResponse = {
  messages: InfobipSmsMessageResult[];
};

type InfobipErrorItem = {
  messageId?: string;
  to?: string;
  from?: string;
  status?: InfobipSmsStatus;
  error?: { groupName?: string; description?: string };
};

export type InfobipErrorResponse = {
  requestError?: {
    serviceException?: {
      messageId?: string;
      text?: string;
      validationErrors?: unknown[];
    };
    policyException?: { messageId?: string; text?: string };
  };
  messages?: InfobipErrorItem[];
};

@Injectable()
export class SmsService {
  private readonly apiKey = process.env.INFOBIP_API_KEY!;
  private readonly baseUrl = process.env.INFOBIP_BASE_URL!;
  private readonly from = process.env.INFOBIP_SMS_SENDER!;

  private readonly http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `App ${this.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 15000,
    });
  }

  async sendSms(to: string, text: string): Promise<InfobipSmsResponse> {
    try {
      const body = {
        messages: [
          {
            from: this.from,
            destinations: [{ to }],
            text,
          },
        ],
      } as const;

      const res = await this.http.post<InfobipSmsResponse>(
        '/sms/2/text/advanced',
        body,
      );

      const msg = res.data?.messages?.[0];
      if (!msg) {
        throw new Error('SMS not sent: empty response');
      }

      const ok = msg.status?.groupName === 'DELIVERED';
      if (!ok) {
        const reason = msg.status?.description ?? 'SMS not sent: unknown error';
        throw new Error(reason);
      }

      return res.data;
    } catch (err: unknown) {
      const ax = err as AxiosError<InfobipErrorResponse>;
      const details = ax.response?.data;

      console.error('Infobip SMS error:', details ?? ax.message);
      throw toError(err);
    }
  }
}
