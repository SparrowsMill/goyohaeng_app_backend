import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { PrismaModule } from '../prisma/prisma.module';

import { PlacesController } from './places.controller';
import { PlacesService } from './places.service';

@Module({
  imports: [
    PrismaModule,

    PassportModule.register({
      defaultStrategy: 'jwt',
    }),
  ],

  controllers: [
    PlacesController,
  ],

  providers: [
    PlacesService,
  ],

  exports: [
    PlacesService,
  ],
})
export class PlacesModule {}