/*
  Prevent duplicate logical rows in region_metrics.

  NULLS NOT DISTINCT is intentional:
  PostgreSQL의 일반 UNIQUE는 NULL != NULL로 취급하기 때문에
  월별 지표처럼 nullable dimension을 가진 동일 logical row의
  중복을 막지 못한다.
*/

CREATE UNIQUE INDEX
    "region_metrics_natural_key_key"
ON "region_metrics" (
    "region_id",
    "source_id",
    "metric_family",
    "metric_code",
    "day_of_week_code",
    "visitor_type_code",
    "period_date",
    "period_month"
)
NULLS NOT DISTINCT;