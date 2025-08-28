import { Body, Controller, Post } from '@nestjs/common';
import { KmsService, EncryptedBlob } from './kms.service';

@Controller('crypto')
export class KmsController {
  constructor(private readonly kms: KmsService) {}

  @Post('encrypt')
  async encrypt(@Body() body: { text: string }) {
    const blob = await this.kms.encrypt(body.text, { app: 'nemory' });
    return blob;
  }

  @Post('decrypt')
  async decrypt(@Body() body: { blob: EncryptedBlob }) {
    const buf = await this.kms.decrypt(body.blob, { app: 'nemory' });
    return { text: buf.toString('utf8') };
  }
}
