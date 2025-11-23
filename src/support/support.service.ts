import { Injectable } from '@nestjs/common';
import { CreateMessageDto } from './dto/create-message.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { SupportMessage } from './entities/support-message.entity';
import { Repository } from 'typeorm';
import { UsersService } from 'src/users/users.service';
import { throwError } from '../common/utils';
import { HttpStatus } from '../common/utils/http-status';
import { EmailsService } from 'src/emails/emails.service';
import { SupportMessageCategory, SupportMessageStatus } from './types';

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

  async getMessages(
    category: SupportMessageCategory,
    status: SupportMessageStatus,
    messageId: number,
    email: string,
    userUuid: string,
    page: number,
    limit: number,
  ) {
    const qb = this.supportMessagesRepository.createQueryBuilder('m');

    if (category) {
      qb.andWhere('m.category = :category', { category });
    }

    if (status) {
      qb.andWhere('m.status = :status', { status });
    }

    if (messageId) {
      qb.andWhere('m.id = :messageId', { messageId });
    }

    if (email) {
      qb.andWhere('m.email = :email', { email });
    }

    if (userUuid) {
      qb.andWhere('user.uuid = :userUuid', { userUuid });
    }

    qb.orderBy('m.createdAt', 'DESC');

    const safeLimit = Math.min(Math.max(limit ?? 20, 1), 200);
    const safePage = Math.max(page ?? 1, 1);

    const [messages, total] = await qb
      .leftJoin('m.user', 'user')
      .addSelect(['user.id', 'user.uuid', 'user.name', 'user.email'])
      .orderBy('m.createdAt', 'DESC')
      .take(safeLimit)
      .skip((safePage - 1) * safeLimit)
      .getManyAndCount();

    return {
      messages,
      total,
      page: safePage,
      pageCount: Math.max(1, Math.ceil(total / safeLimit)),
      limit: safeLimit,
    };
  }

  async updateStatus(id: number, status: SupportMessageStatus) {
    const message = await this.supportMessagesRepository.findOneByOrFail({
      id,
    });
    message.status = status;
    await this.supportMessagesRepository.save(message);
    return { status: 'OK' };
  }
}
