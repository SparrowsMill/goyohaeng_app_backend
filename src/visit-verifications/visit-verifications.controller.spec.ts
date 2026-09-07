import { Test, TestingModule } from '@nestjs/testing';
import { VisitVerificationsController } from './visit-verifications.controller';

describe('VisitVerificationsController', () => {
  let controller: VisitVerificationsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VisitVerificationsController],
    }).compile();

    controller = module.get<VisitVerificationsController>(VisitVerificationsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
