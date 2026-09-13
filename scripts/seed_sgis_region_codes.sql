-- scripts/seed_sgis_region_codes.sql
-- Purpose:
--   Map Seoul's 25 DISTRICT Region rows to the SGIS sigungu adm_cd values
--   used by the frontend GeoJSON.
--
-- API field name: sgisCode
-- region_external_codes.code_type: SGIS_ADM_CD
-- external_sources.code: SGIS
--
-- Safe to re-run. It only replaces SGIS_ADM_CD mappings for Seoul DISTRICT rows.

BEGIN;

-- 1) Register the code-system source.
INSERT INTO external_sources (
    code,
    name,
    base_url,
    refresh_cycle
)
VALUES (
    'SGIS',
    '통계청 SGIS 행정구역코드',
    NULL,
    NULL
)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name;

-- 2) Stage the frontend-provided Seoul sigungu mapping.
CREATE TEMP TABLE _sgis_seoul_sigungu (
    external_code VARCHAR(100) PRIMARY KEY,
    region_name   VARCHAR(150) NOT NULL UNIQUE
) ON COMMIT DROP;

INSERT INTO _sgis_seoul_sigungu (external_code, region_name)
VALUES
    ('11010', '종로구'),
    ('11020', '중구'),
    ('11030', '용산구'),
    ('11040', '성동구'),
    ('11050', '광진구'),
    ('11060', '동대문구'),
    ('11070', '중랑구'),
    ('11080', '성북구'),
    ('11090', '강북구'),
    ('11100', '도봉구'),
    ('11110', '노원구'),
    ('11120', '은평구'),
    ('11130', '서대문구'),
    ('11140', '마포구'),
    ('11150', '양천구'),
    ('11160', '강서구'),
    ('11170', '구로구'),
    ('11180', '금천구'),
    ('11190', '영등포구'),
    ('11200', '동작구'),
    ('11210', '관악구'),
    ('11220', '서초구'),
    ('11230', '강남구'),
    ('11240', '송파구'),
    ('11250', '강동구');

-- 3) Fail before writing mappings if the current Region master does not match
--    the expected Seoul 25-district set.
DO $$
DECLARE
    v_seed_count  INTEGER;
    v_match_count INTEGER;
    v_unmatched   TEXT;
BEGIN
    SELECT COUNT(*)
    INTO v_seed_count
    FROM _sgis_seoul_sigungu;

    IF v_seed_count <> 25 THEN
        RAISE EXCEPTION 'SGIS seed must contain exactly 25 Seoul districts; got %', v_seed_count;
    END IF;

    SELECT COUNT(*)
    INTO v_match_count
    FROM _sgis_seoul_sigungu s
    JOIN regions r
      ON r.name = s.region_name
     AND r.region_type = 'DISTRICT'
    JOIN regions p
      ON p.id = r.parent_id
     AND p.name = '서울특별시'
     AND p.region_type = 'PROVINCE';

    IF v_match_count <> 25 THEN
        SELECT STRING_AGG(s.region_name, ', ' ORDER BY s.region_name)
        INTO v_unmatched
        FROM _sgis_seoul_sigungu s
        WHERE NOT EXISTS (
            SELECT 1
            FROM regions r
            JOIN regions p
              ON p.id = r.parent_id
            WHERE r.name = s.region_name
              AND r.region_type = 'DISTRICT'
              AND p.name = '서울특별시'
              AND p.region_type = 'PROVINCE'
        );

        RAISE EXCEPTION
            'Current regions master does not match all 25 Seoul districts. matched=%, unmatched=%',
            v_match_count,
            COALESCE(v_unmatched, '<unknown>');
    END IF;
END $$;

-- 4) Replace only the Seoul DISTRICT mappings for this SGIS code type.
DELETE FROM region_external_codes rec
USING external_sources es, regions r, regions p
WHERE rec.source_id = es.id
  AND es.code = 'SGIS'
  AND rec.code_type = 'SGIS_ADM_CD'
  AND rec.region_id = r.id
  AND r.parent_id = p.id
  AND r.region_type = 'DISTRICT'
  AND p.name = '서울특별시'
  AND p.region_type = 'PROVINCE';

-- 5) Insert the canonical 25 mappings.
INSERT INTO region_external_codes (
    region_id,
    source_id,
    code_type,
    external_code,
    external_name
)
SELECT
    r.id,
    es.id,
    'SGIS_ADM_CD',
    s.external_code,
    s.region_name
FROM _sgis_seoul_sigungu s
JOIN regions r
  ON r.name = s.region_name
 AND r.region_type = 'DISTRICT'
JOIN regions p
  ON p.id = r.parent_id
 AND p.name = '서울특별시'
 AND p.region_type = 'PROVINCE'
JOIN external_sources es
  ON es.code = 'SGIS'
ON CONFLICT (source_id, code_type, external_code)
DO UPDATE SET
    region_id = EXCLUDED.region_id,
    external_name = EXCLUDED.external_name;

COMMIT;

-- Verification: should return 25 rows.
SELECT
    r.id AS region_id,
    r.name AS region_name,
    rec.external_code AS sgis_code
FROM region_external_codes rec
JOIN external_sources es
  ON es.id = rec.source_id
JOIN regions r
  ON r.id = rec.region_id
WHERE es.code = 'SGIS'
  AND rec.code_type = 'SGIS_ADM_CD'
ORDER BY rec.external_code;

-- Verification summary: should be mapping_rows=25, mapped_regions=25, duplicate_codes=0.
SELECT
    COUNT(*) AS mapping_rows,
    COUNT(DISTINCT rec.region_id) AS mapped_regions,
    COUNT(*) - COUNT(DISTINCT rec.external_code) AS duplicate_codes
FROM region_external_codes rec
JOIN external_sources es
  ON es.id = rec.source_id
WHERE es.code = 'SGIS'
  AND rec.code_type = 'SGIS_ADM_CD';
