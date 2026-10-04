import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import {
  ActiveUserData,
  ActiveUserDataT,
} from 'src/auth/decorators/active-user.decorator';
import { AiService } from '../ai.service';
import { AiCreditCycleId, PlanGuard } from '../guards/plan.guard';
import { ImageGenerationService } from './image-generation.service';
import {
  IMAGE_PROMPT_LIMIT,
  imageGenerationQuote,
} from './image-generation.policy';

class ImageQuoteDto {
  @IsString() @MinLength(1) @MaxLength(IMAGE_PROMPT_LIMIT) prompt!: string;
}
class ImageGenerateDto extends ImageQuoteDto {
  @IsUUID() id!: string;
}

@Controller('ai/images')
@UseGuards(AuthGuard('jwt'))
export class ImageGenerationController {
  constructor(
    private readonly ai: AiService,
    private readonly images: ImageGenerationService,
  ) {}

  @Post('quote')
  quote(@Body() dto: ImageQuoteDto) {
    return imageGenerationQuote(dto.prompt);
  }

  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  result(
    @ActiveUserData() user: ActiveUserDataT,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.images.result(user.id, id);
  }

  @Post('generate')
  @UseGuards(PlanGuard)
  @AiCreditCycleId('id')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  generate(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() dto: ImageGenerateDto,
  ) {
    return this.ai.executeResponse({ userId: user.id, imageGeneration: dto });
  }
}
