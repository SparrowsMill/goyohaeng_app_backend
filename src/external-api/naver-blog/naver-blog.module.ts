import { Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';

import { NaverBlogService } from './naver-blog.service';

@Module({
  imports: [
    PrismaModule,
  ],

  providers: [
    NaverBlogService,
  ],

  exports: [
    NaverBlogService,
  ],
})
export class NaverBlogModule {}