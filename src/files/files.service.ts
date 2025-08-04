import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FilesService {
  private s3Client: S3Client;
  private bucket: string;

  constructor(private configService: ConfigService) {
    const region = this.configService.get<string>('DO_SPACES_REGION');
    const endpoint = this.configService.get<string>('DO_SPACES_ENDPOINT');
    const accessKeyId = this.configService.get<string>('DO_SPACES_KEY');
    const secretAccessKey = this.configService.get<string>('DO_SPACES_SECRET');
    const bucket = this.configService.get<string>('DO_SPACES_NAME');

    if (!region || !endpoint || !accessKeyId || !secretAccessKey || !bucket) {
      throw new Error('Missing required DigitalOcean Spaces env variables');
    }

    this.bucket = bucket;

    this.s3Client = new S3Client({
      region,
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: false,
    });
  }

  async uploadToBackblaze(
    userId: number,
    file: Express.Multer.File,
  ): Promise<string> {
    const ext = path.extname(file.originalname);
    const fileName = `images/${userId}/${uuidv4()}${ext}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: 'public-read',
    });

    await this.s3Client.send(command);

    return `https://${this.bucket}.${this.configService.get<string>('DO_SPACES_ENDPOINT')!.replace('https://', '')}/${fileName}`;
  }
}
