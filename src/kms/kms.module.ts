import { Module } from '@nestjs/common';
import { KmsService } from './kms.service';
import { KMSClient } from '@aws-sdk/client-kms';
import { KmsController } from './kms.controller';
import { User } from 'src/users/entities/user.entity';
import { UserKeysService } from './user-keys.service';
import { CryptoService } from './crypto.service';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [
    {
      provide: KMSClient,
      useFactory: () =>
        new KMSClient({
          region: process.env.AWS_REGION || 'eu-central-1',
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
          },
        }),
    },
    KmsService,
    UserKeysService,
    CryptoService,
  ],
  controllers: [KmsController],
  exports: [CryptoService, UserKeysService, KmsService],
})
export class KmsModule {}
