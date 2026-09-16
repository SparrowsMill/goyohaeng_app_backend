import { Injectable } from '@nestjs/common';

import { RegionVisitorService } from '../region-visitor/region-visitor.service';
import { TourismResourceDemandService } from '../tourism-resource-demand/tourism-resource-demand.service';
import { TourismDemandStrengthService } from '../tourism-demand-strength/tourism-demand-strength.service';

@Injectable()
export class GapDataPeriodService {
  constructor(
    private readonly regionVisitorService: RegionVisitorService,
    private readonly resourceDemandService: TourismResourceDemandService,
    private readonly demandStrengthService: TourismDemandStrengthService,
  ) {}

  private subtractMonth(
    baseYm: string,
    offset: number,
  ): string {
    if (!/^\d{6}$/.test(baseYm)) {
      throw new Error(`Invalid baseYm: ${baseYm}`);
    }

    const year = Number(baseYm.slice(0, 4));
    const month = Number(baseYm.slice(4, 6));

    const date = new Date(
      Date.UTC(
        year,
        month - 1 - offset,
        1,
      ),
    );

    return (
      String(date.getUTCFullYear()) +
      String(date.getUTCMonth() + 1).padStart(2, '0')
    );
  }

  /**
   * GAP 지역 데이터에 사용할 최신 공통 기준월 탐색.
   *
   * 1. 각 source의 최신 사용 가능 월 탐색
   * 2. 셋 중 가장 오래된 월부터 시작
   * 3. 실제로 세 source가 모두 그 월을 제공하는지 검증
   * 4. 아니면 한 달씩 과거로 이동
   */
  async findLatestCommonMonth() {
    const [
      latestVisitorMonth,
      latestResourceMonth,
      latestStrengthMonth,
    ] = await Promise.all([
      this.regionVisitorService.findLatestCompleteMonth(),
      this.resourceDemandService.findLatestAvailableMonth(),
      this.demandStrengthService.findLatestAvailableMonth(),
    ]);

    console.log(
      '[GapDataPeriod] latest source months:',
      {
        latestVisitorMonth,
        latestResourceMonth,
        latestStrengthMonth,
      },
    );

    /*
     * YYYYMM은 같은 길이 문자열이므로
     * lexicographical sort로 시간순 정렬 가능.
     */
    const initialCandidate = [
      latestVisitorMonth,
      latestResourceMonth,
      latestStrengthMonth,
    ].sort()[0];

    for (let offset = 0; offset < 24; offset++) {
      const candidate =
        this.subtractMonth(
          initialCandidate,
          offset,
        );

      console.log(
        `[GapDataPeriod] checking common month ${candidate}`,
      );

      const [
        visitorAvailable,
        resourceAvailable,
        strengthAvailable,
      ] = await Promise.all([
        candidate === latestVisitorMonth
          ? Promise.resolve(true)
          : this.regionVisitorService.isCompleteMonth(candidate),

        candidate === latestResourceMonth
          ? Promise.resolve(true)
          : this.resourceDemandService.monthHasData(candidate),

        candidate === latestStrengthMonth
          ? Promise.resolve(true)
          : this.demandStrengthService.monthHasData(candidate),
      ]);

      console.log(
        `[GapDataPeriod] ${candidate}: ` +
          `visitor=${visitorAvailable}, ` +
          `resource=${resourceAvailable}, ` +
          `strength=${strengthAvailable}`,
      );

      if (
        visitorAvailable &&
        resourceAvailable &&
        strengthAvailable
      ) {
        return {
          commonMonth: candidate,
          latestVisitorMonth,
          latestResourceMonth,
          latestStrengthMonth,
        };
      }
    }

    throw new Error(
      '최근 24개월 안에서 GAP용 공통 데이터 월을 찾지 못했습니다.',
    );
  }
}