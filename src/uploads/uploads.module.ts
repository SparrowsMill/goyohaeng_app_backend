import {
  Module,
} from '@nestjs/common';

import {
  PassportModule,
} from '@nestjs/passport';

import {
  UploadsController,
} from './uploads.controller';

import {
  UploadsService,
} from './uploads.service';

@Module({
  imports: [
    PassportModule.register({
      defaultStrategy: 'jwt',
    }),
  ],

  controllers: [
    UploadsController,
  ],

  providers: [
    UploadsService,
  ],
})
export class UploadsModule {}