import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class FilesService {
  private s3: S3Client;
  private bucket = process.env.B2_BUCKET_NAME!;

  constructor() {
    this.s3 = new S3Client({
      region: process.env.B2_REGION!,
      endpoint: process.env.B2_ENDPOINT!,
      credentials: {
        accessKeyId: process.env.B2_KEY_ID!,
        secretAccessKey: process.env.B2_APPLICATION_KEY!,
      },
      forcePathStyle: true,
    });
  }

  async uploadToBackblaze(file: Express.Multer.File): Promise<string> {
    const ext = path.extname(file.originalname);
    const fileName = `uploads/${uuidv4()}${ext}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: 'public-read',
      ChecksumAlgorithm: undefined,
    });

    await this.s3.send(command);

    return `${process.env.B2_PUBLIC_URL}/${fileName}`;
  }
}
