import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RegionsModule } from './regions/regions.module';
import { PlacesModule } from './places/places.module';
import { CategoriesModule } from './categories/categories.module';
import { VisitVerificationsModule } from './visit-verifications/visit-verifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    AuthModule,
    UsersModule,
    RegionsModule,
    PlacesModule,
    CategoriesModule,
    VisitVerificationsModule,
  ],
})
export class AppModule {}