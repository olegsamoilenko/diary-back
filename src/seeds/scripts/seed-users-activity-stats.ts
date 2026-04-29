import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { UserStatisticsService } from '../../user-statistics/user-statistics.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const service = app.get(UserStatisticsService);

    const result = await service.seedUsersActivityStats();

    console.log('[SEED][users_activity_stats] Done:', result);
  } catch (error) {
    console.error('[SEED][users_activity_stats] Failed:', error);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

bootstrap();
