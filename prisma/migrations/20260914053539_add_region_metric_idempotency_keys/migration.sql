/*
  Warnings:

  - A unique constraint covering the columns `[source_id,region_id,metric_family,metric_code,period_date,visitor_type_code]` on the table `region_metrics` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[source_id,region_id,metric_family,metric_code,period_month]` on the table `region_metrics` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "region_metrics_daily_key" ON "region_metrics"("source_id", "region_id", "metric_family", "metric_code", "period_date", "visitor_type_code");

-- CreateIndex
CREATE UNIQUE INDEX "region_metrics_monthly_key" ON "region_metrics"("source_id", "region_id", "metric_family", "metric_code", "period_month");
