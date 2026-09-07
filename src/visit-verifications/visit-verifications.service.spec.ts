import { Test, TestingModule } from '@nestjs/testing';
import { VisitVerificationsService } from './visit-verifications.service';

describe('VisitVerificationsService', () => {
  let service: VisitVerificationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [VisitVerificationsService],
    }).compile();

    service = module.get<VisitVerificationsService>(VisitVerificationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
