import { Module } from '@nestjs/common';

import { SmallBusinessController } from './small-business.controller';
import { SmallBusinessService } from './small-business.service';

@Module({
  controllers: [SmallBusinessController],
  providers: [SmallBusinessService],
  exports: [SmallBusinessService],
})
export class SmallBusinessModule {}