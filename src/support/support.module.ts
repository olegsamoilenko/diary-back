import { Module } from '@nestjs/common';
import { SupportService } from './support.service';
import { SupportController } from './support.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupportMessage } from './entities/support-message.entity';
import { UsersModule } from 'src/users/users.module';
import { EmailsModule } from 'src/emails/emails.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SupportMessage]),
    UsersModule,
    EmailsModule,
  ],
  providers: [SupportService],
  controllers: [SupportController],
  exports: [],
})
export class SupportModule {}
