import { Injectable } from '@nestjs/common';
import { CreateMessageDto } from './dto/create-message.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { SupportMessage } from './entities/support-message.entity';
import { Repository } from 'typeorm';
import { UsersService } from 'src/users/users.service';
import { throwError } from '../common/utils';
import { HttpStatus } from '../common/utils/http-status';
import { EmailsService } from 'src/emails/emails.service';

@Injectable()
export class SupportService {
  constructor(
    @InjectRepository(SupportMessage)
    private supportMessagesRepository: Repository<SupportMessage>,
    private usersService: UsersService,
    private emailsService: EmailsService,
  ) {}
  async createMessage(userId: number, dto: CreateMessageDto) {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User not found',
        'User with this UUID does not exist.',
        'USER_NOT_FOUND',
      );
    }

    // Normalize input to reduce storage noise and inconsistencies
    const normalizedEmail = dto.email.trim().toLowerCase();
    const normalizedTitle = dto.title.trim();
    const normalizedText = dto.text.trim();

    const message = this.supportMessagesRepository.create({
      email: normalizedEmail,
      title: normalizedTitle,
      text: normalizedText,
      category: dto.category,
      user: user,
    });

    await this.supportMessagesRepository.save(message);

    await this.emailsService.send(
      ['nemoryai.diary@gmail.com'],
      `Support message, category: ${dto.category}`,
      '/support/income-support-message',
      {
        uuid: user.uuid,
        name: user.name,
        userEmail: user.email,
        email: normalizedEmail,
        category: dto.category,
        title: normalizedTitle,
        text: normalizedText,
      },
    );

    return { status: 'OK' };
  }
}
