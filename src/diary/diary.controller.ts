import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
  Request,
} from '@nestjs/common';
import { DiaryService } from './diary.service';
import {
  CreateDiaryEntryDto,
  GetDiaryEntriesByDayDto,
  GetMoodsByDateDto,
} from './dto';
import {
  ActiveUserData,
  ActiveUserDataT,
} from 'src/auth/decorators/active-user.decorator';
import { AuthGuard } from '@nestjs/passport';

@UseGuards(AuthGuard('jwt'))
@Controller('diary-entries')
export class DiaryController {
  constructor(private readonly diaryService: DiaryService) {}

  @Post('create')
  async createEntry(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() entryData: CreateDiaryEntryDto,
  ) {
    return await this.diaryService.createEntry(entryData, user.id);
  }

  @Post('get-by-date')
  async getEntriesByDate(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() getDiaryEntriesByDayDto: GetDiaryEntriesByDayDto,
  ) {
    return await this.diaryService.getEntriesByDate(
      user.id,
      getDiaryEntriesByDayDto,
    );
  }

  @Post('get-moods-by-date')
  async getMoodsByDate(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() getMoodsByDateDto: GetMoodsByDateDto,
  ) {
    return await this.diaryService.getMoodsByDate(user.id, getMoodsByDateDto);
  }

  @Get('get-by-id/:id')
  async getEntryById(
    @ActiveUserData() user: ActiveUserDataT,
    @Param('id') entryId: number,
  ) {
    return await this.diaryService.getEntryById(entryId, user.id);
  }

  // @UseGuards(PlanGuard)
  // @Post('dialog')
  // async dialog(
  //   @ActiveUserData() user: ActiveUserDataT,
  //   @Body() dialogDto: DialogDto,
  // ) {
  //   return await this.diaryService.dialog(user.id, dialogDto);
  // }

  @Delete(':id')
  async deleteEntry(
    @ActiveUserData() user: ActiveUserDataT,
    @Param('id') entryId: number,
  ) {
    return await this.diaryService.deleteEntry(entryId);
  }
}
