import { Global, Module } from '@nestjs/common';
import { AiErrorReporterService } from './ai-error-reporter.service';

@Global()
@Module({
  providers: [AiErrorReporterService],
  exports: [AiErrorReporterService],
})
export class AiErrorReporterModule {}
