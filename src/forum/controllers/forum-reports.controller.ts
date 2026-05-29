import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
import { UpdateForumReportStatusDto } from '../dto/update-forum-report-status.dto';

@Controller('forum/reports')
export class ForumReportsController {
  constructor(private readonly reportsService: ForumReportsService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'))
  createReport(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() dto: CreateForumReportDto,
  ) {
    return this.reportsService.createReport(user.id, dto);
  }

  @Get()
  @UseGuards(AuthGuard('admin-jwt'))
  getReports(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('reportId') reportId?: string,
  ) {
    return this.reportsService.getReports(
      Number(page || 1),
      Number(limit || 30),
      reportId,
    );
  }

  @Patch(':reportId/status')
  @UseGuards(AuthGuard('admin-jwt'))
  updateReportStatus(
    @Param('reportId') reportId: string,
    @Body() dto: UpdateForumReportStatusDto,
  ) {
    return this.reportsService.updateReportStatus({
      reportId,
      status: dto.status,
      adminId: dto.adminId,
    });
  }
}
