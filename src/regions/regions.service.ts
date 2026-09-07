import { Injectable } from '@nestjs/common';

export type RegionType =
  | 'PROVINCE'
  | 'DISTRICT'
  | 'ADMIN_DONG'
  | 'LEGAL_DONG';

export interface Region {
  id: number;
  parentId: number | null;
  regionType: RegionType;
  name: string;
}

@Injectable()
export class RegionsService {
  private readonly regions: Region[] = [
    {
      id: 1,
      parentId: null,
      regionType: 'PROVINCE',
      name: '전라남도',
    },
    {
      id: 2,
      parentId: 1,
      regionType: 'DISTRICT',
      name: '담양군',
    },
    {
      id: 3,
      parentId: 1,
      regionType: 'DISTRICT',
      name: '순천시',
    },
    {
      id: 4,
      parentId: 1,
      regionType: 'DISTRICT',
      name: '여수시',
    },
  ];

  findAll(): Region[] {
    return this.regions;
  }
}