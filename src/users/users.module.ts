import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { PrismaModule } from '../prisma/prisma.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

import {
  UploadsModule,
} from '../uploads/uploads.module';

@Module({
  imports: [
    PrismaModule,

    PassportModule.register({
      defaultStrategy: 'jwt',
    }),

    UploadsModule,
  ],

  controllers: [
    UsersController,
  ],

  providers: [
    UsersService,
  ],

  exports: [
    UsersService,
  ],
})
export class UsersModule {}