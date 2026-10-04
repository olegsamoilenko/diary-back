import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Query,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';
import {
  ActiveUserData,
  ActiveUserDataT,
} from 'src/auth/decorators/active-user.decorator';
import { AiModel } from 'src/users/types';
import { MediaAnalysisService } from './media-analysis.service';
import {
  estimateMedia,
  MEDIA_POLICY,
  mediaPricingCatalog,
  MediaKind,
} from './media-policy';

export class MediaEstimateDto {
  @IsIn([
    AiModel.QWEN_3_8_MAX,
    AiModel.GPT_5_6_TERRA,
    AiModel.GPT_5_6_LUNA,
    AiModel.CLAUDE_SONNET_5,
    AiModel.CLAUDE_SONNET_5_5,
  ])
  model!: AiModel;
  @IsIn(['image', 'audio', 'video']) kind!: MediaKind;
  @IsOptional() @IsInt() @Min(1) width?: number;
  @IsOptional() @IsInt() @Min(1) height?: number;
  @IsOptional() @IsNumber() @Min(0.001) durationSeconds?: number;
  @IsOptional() @IsBoolean() hasAudio?: boolean;
}
export class MediaStatusDto {
  @IsIn([
    AiModel.QWEN_3_8_MAX,
    AiModel.GPT_5_6_TERRA,
    AiModel.GPT_5_6_LUNA,
    AiModel.CLAUDE_SONNET_5,
    AiModel.CLAUDE_SONNET_5_5,
  ])
  model!: AiModel;
}
export class MediaUploadDto {
  @IsUUID() id!: string;
  @IsIn([
    AiModel.QWEN_3_8_MAX,
    AiModel.GPT_5_6_TERRA,
    AiModel.GPT_5_6_LUNA,
    AiModel.CLAUDE_SONNET_5,
    AiModel.CLAUDE_SONNET_5_5,
  ])
  model!: AiModel;
  @IsIn(['image', 'audio', 'video']) kind!: MediaKind;
}

// Preparation and estimates are free. Paid transcription only runs inside the
// existing PlanGuard-protected generation cycle, never on upload or selection.
@Controller('ai/media')
@UseGuards(AuthGuard('jwt'))
export class MediaAnalysisController {
  constructor(private readonly media: MediaAnalysisService) {}
  @Get('pricing')
  @Header('Cache-Control', 'private, no-store')
  pricing() {
    return mediaPricingCatalog();
  }
  @Post('estimate') estimate(@Body() dto: MediaEstimateDto) {
    return estimateMedia(dto.model, dto);
  }
  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  status(
    @ActiveUserData() user: ActiveUserDataT,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: MediaStatusDto,
  ) {
    return this.media.status(user.id, id, dto.model);
  }
  @Post('prepare')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: MEDIA_POLICY.maxUploadBytes,
        files: 1,
        fields: 3,
        fieldSize: 1024,
      },
    }),
  )
  prepare(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() dto: MediaUploadDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (
      !file ||
      !file.mimetype.startsWith(`${dto.kind === 'image' ? 'image' : dto.kind}/`)
    )
      throw new BadRequestException('MEDIA_TYPE_MISMATCH');
    return this.media.upload(user.id, dto.id, dto.kind, dto.model, file.buffer);
  }
  @Delete(':id') remove(
    @ActiveUserData() user: ActiveUserDataT,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.media.remove(user.id, id);
  }
}
