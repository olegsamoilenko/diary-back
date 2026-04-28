import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ForumReportsService } from '../services/forum-reports.service';
import { CreateForumReportDto } from '../dto/create-forum-report.dto';
import { AuthGuard } from '@nestjs/passport';
import {
  ActiveUserData,
  ActiveUserDataT,
} from '../../auth/decorators/active-user.decorator';

@Controller('forum/reports')
@UseGuards(AuthGuard('jwt'))
export class ForumReportsController {
  constructor(private readonly reportsService: ForumReportsService) {}

  @Post()
  createReport(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() dto: CreateForumReportDto,
  ) {
    return this.reportsService.createReport(user.id, dto);
  }

  @Get('my')
  getMyReports(
    @ActiveUserData() user: ActiveUserDataT,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reportsService.getMyReports(
      user.id,
      Number(page || 1),
      Number(limit || 30),
    );
  }
}
