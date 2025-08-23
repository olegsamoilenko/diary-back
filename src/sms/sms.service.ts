import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class SmsService {
  private readonly apiKey = process.env.INFOBIP_API_KEY!;
  private readonly baseUrl = process.env.INFOBIP_BASE_URL!;
  private readonly from = process.env.INFOBIP_SMS_SENDER!;

  async sendSms(to: string, text: string) {
    try {
      const res = await axios.post(
        `${this.baseUrl}/sms/2/text/advanced`,
        {
          messages: [
            {
              from: this.from,
              destinations: [{ to }],
              text,
            },
          ],
        },
        {
          headers: {
            Authorization: `App ${this.apiKey}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        },
      );

      if (
        !res.data.messages ||
        res.data.messages[0].status.groupName !== 'DELIVERED'
      ) {
        throw new Error(
          res.data.messages?.[0]?.status?.description ||
            'SMS not sent: unknown error',
        );
      }
      return res.data;
    } catch (err) {
      console.error('Infobip SMS error:', err?.response?.data || err);
      throw err;
    }
  }
}
