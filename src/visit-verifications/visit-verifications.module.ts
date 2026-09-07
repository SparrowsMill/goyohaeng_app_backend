import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { PlacesModule } from '../places/places.module';
import { VisitVerificationsController } from './visit-verifications.controller';
import { VisitVerificationsService } from './visit-verifications.service';

@Module({
  imports: [
    PlacesModule,
    PassportModule.register({
      defaultStrategy: 'jwt',
    }),
  ],
  controllers: [
    VisitVerificationsController,
  ],
  providers: [
    VisitVerificationsService,
  ],
})
export class VisitVerificationsModule {}