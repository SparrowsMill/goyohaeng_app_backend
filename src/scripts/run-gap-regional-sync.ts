import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { ExternalApiAutomationService } from '../external-api/automation/external-api-automation.service';

async function main() {
  const app =
    await NestFactory.createApplicationContext(
      AppModule,
      {
        logger: [
          'log',
          'error',
          'warn',
        ],
      },
    );

  try {
    const automation =
      app.get(
        ExternalApiAutomationService,
      );

    console.log(
      '\n===== GAP REGIONAL SYNC START =====\n',
    );

    const result =
      await automation.runGapRegionalSync();

    console.log(
      '\n===== GAP REGIONAL SYNC SUCCESS =====',
    );

    console.dir(
      result,
      {
        depth: null,
      },
    );
  } catch (error) {
    console.error(
      '\n===== GAP REGIONAL SYNC FAILED =====',
    );

    console.error(error);

    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main();