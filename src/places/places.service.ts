import { Injectable } from '@nestjs/common';

export type PlaceStatus =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'CLOSED'
  | 'HIDDEN';

export interface Place {
  id: number;
  name: string;

  categoryId: number | null;

  districtRegionId: number | null;
  adminDongRegionId: number | null;
  legalDongRegionId: number | null;

  roadAddress: string | null;
  lotAddress: string | null;
  postalCode: string | null;

  latitude: number | null;
  longitude: number | null;

  phone: string | null;
  homepage: string | null;

  ownerIntro: string | null;

  status: PlaceStatus;
}

interface PlaceImage {
  id: number;
  placeId: number;
  originalUrl: string;
  thumbnailUrl: string | null;
  displayOrder: number;
}

interface PlaceOperatingHour {
  dayOfWeek: number;
  isClosed: boolean;
  openTime: string | null;
  closeTime: string | null;
  breakStartTime: string | null;
  breakEndTime: string | null;
}

interface PlaceBenefit {
  id: number;
  title: string;
  description: string | null;
}

interface VerificationSetting {
  enabled: boolean;
  controlMode: 'AUTO' | 'MANUAL';
  hoursMode: 'SAME_AS_OPERATING' | 'CUSTOM';
  codeValidMinutes: number;
}

export interface PlaceDetail extends Place {
  images: PlaceImage[];
  operatingHours: PlaceOperatingHour[];
  benefits: PlaceBenefit[];
  verification: VerificationSetting | null;
}

@Injectable()
export class PlacesService {
  private readonly places: Place[] = [
    {
      id: 1,
      name: '담양 죽녹원',
      categoryId: 3,

      districtRegionId: 2,
      adminDongRegionId: null,
      legalDongRegionId: null,

      roadAddress: '전라남도 담양군 담양읍 죽녹원로 119',
      lotAddress: null,
      postalCode: null,

      latitude: 35.3251,
      longitude: 126.9883,

      phone: '061-380-2680',
      homepage: null,

      ownerIntro: '대나무 숲길을 걸으며 쉬어갈 수 있는 공간입니다.',

      status: 'ACTIVE',
    },
    {
      id: 2,
      name: '메타세쿼이아길',
      categoryId: 3,

      districtRegionId: 2,
      adminDongRegionId: null,
      legalDongRegionId: null,

      roadAddress: '전라남도 담양군 담양읍 메타세쿼이아로',
      lotAddress: null,
      postalCode: null,

      latitude: 35.3218,
      longitude: 126.9836,

      phone: null,
      homepage: null,
      ownerIntro: null,

      status: 'ACTIVE',
    },
    {
      id: 3,
      name: '담양 테스트 카페',
      categoryId: 2,

      districtRegionId: 2,
      adminDongRegionId: null,
      legalDongRegionId: null,

      roadAddress: null,
      lotAddress: null,
      postalCode: null,

      latitude: 35.32,
      longitude: 126.99,

      phone: null,
      homepage: null,
      ownerIntro: null,

      status: 'ACTIVE',
    },
    {
      id: 4,
      name: '순천만 국가정원',
      categoryId: 3,

      districtRegionId: 3,
      adminDongRegionId: null,
      legalDongRegionId: null,

      roadAddress: null,
      lotAddress: null,
      postalCode: null,

      latitude: 34.9285,
      longitude: 127.4872,

      phone: null,
      homepage: null,
      ownerIntro: null,

      status: 'ACTIVE',
    },
    {
      id: 5,
      name: '순천 테스트 식당',
      categoryId: 1,

      districtRegionId: 3,
      adminDongRegionId: null,
      legalDongRegionId: null,

      roadAddress: null,
      lotAddress: null,
      postalCode: null,

      latitude: 34.95,
      longitude: 127.48,

      phone: null,
      homepage: null,
      ownerIntro: null,

      status: 'ACTIVE',
    },
  ];

  private readonly placeImages: PlaceImage[] = [
    {
      id: 1,
      placeId: 1,
      originalUrl: 'https://example.com/juknokwon-1.jpg',
      thumbnailUrl: 'https://example.com/juknokwon-1-thumb.jpg',
      displayOrder: 1,
    },
    {
      id: 2,
      placeId: 1,
      originalUrl: 'https://example.com/juknokwon-2.jpg',
      thumbnailUrl: null,
      displayOrder: 2,
    },
  ];

  private readonly operatingHours: Record<
    number,
    PlaceOperatingHour[]
  > = {
    1: [
      {
        dayOfWeek: 1,
        isClosed: false,
        openTime: '09:00',
        closeTime: '18:00',
        breakStartTime: null,
        breakEndTime: null,
      },
      {
        dayOfWeek: 2,
        isClosed: false,
        openTime: '09:00',
        closeTime: '18:00',
        breakStartTime: null,
        breakEndTime: null,
      },
      {
        dayOfWeek: 3,
        isClosed: false,
        openTime: '09:00',
        closeTime: '18:00',
        breakStartTime: null,
        breakEndTime: null,
      },
      {
        dayOfWeek: 4,
        isClosed: false,
        openTime: '09:00',
        closeTime: '18:00',
        breakStartTime: null,
        breakEndTime: null,
      },
      {
        dayOfWeek: 5,
        isClosed: false,
        openTime: '09:00',
        closeTime: '18:00',
        breakStartTime: null,
        breakEndTime: null,
      },
      {
        dayOfWeek: 6,
        isClosed: false,
        openTime: '09:00',
        closeTime: '19:00',
        breakStartTime: null,
        breakEndTime: null,
      },
      {
        dayOfWeek: 7,
        isClosed: false,
        openTime: '09:00',
        closeTime: '19:00',
        breakStartTime: null,
        breakEndTime: null,
      },
    ],
  };

  private readonly benefits: Record<number, PlaceBenefit[]> = {
    1: [
      {
        id: 1,
        title: '방문 인증 혜택',
        description: '방문 인증 시 지역 재료를 획득할 수 있습니다.',
      },
    ],
  };

  private readonly verificationSettings: Record<
    number,
    VerificationSetting
  > = {
    1: {
      enabled: true,
      controlMode: 'AUTO',
      hoursMode: 'SAME_AS_OPERATING',
      codeValidMinutes: 30,
    },
  };

  findAll(
    regionId?: number,
    categoryId?: number,
  ): Place[] {
    return this.places.filter((place) => {
      if (place.status !== 'ACTIVE') {
        return false;
      }

      if (
        regionId !== undefined &&
        place.districtRegionId !== regionId
      ) {
        return false;
      }

      if (
        categoryId !== undefined &&
        place.categoryId !== categoryId
      ) {
        return false;
      }

      return true;
    });
  }

  findById(id: number): PlaceDetail | undefined {
    const place = this.places.find(
      (place) =>
        place.id === id &&
        place.status === 'ACTIVE',
    );

    if (!place) {
      return undefined;
    }

    return {
      ...place,

      images: this.placeImages
        .filter((image) => image.placeId === id)
        .sort((a, b) => a.displayOrder - b.displayOrder),

      operatingHours:
        this.operatingHours[id] ?? [],

      benefits:
        this.benefits[id] ?? [],

      verification:
        this.verificationSettings[id] ?? null,
    };
  }
}