import argparse
import os
from collections import Counter, defaultdict
from pathlib import Path

import geopandas as gpd
import pandas as pd
import psycopg
from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parents[1]
SHAPEFILE = ROOT / "scripts" / "data" / "seoul_district_boundary" / "DRL_DST_AS.shp"
VALIDATOR_VERSION = "SEOUL_GU_POLYGON_V1"


def load_db_url():
    load_dotenv(ROOT / ".env")
    url = os.getenv("DIRECT_URL") or os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DIRECT_URL or DATABASE_URL not found")
    return url


def load_polygons():
    gdf = gpd.read_file(
        SHAPEFILE,
        encoding="cp949",
    )

    if len(gdf) != 25:
        raise RuntimeError(f"Expected 25 districts, got {len(gdf)}")

    gdf = gdf.to_crs(epsg=4326)

    gdf["district_name"] = (
        gdf["HAD_NAM"]
        .astype(str)
        .str.strip()
    )

    return gdf[["district_name", "geometry"]]


def load_regions(conn):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, name
            FROM regions
            WHERE region_type = 'DISTRICT'
              AND parent_id = 1
            ORDER BY id
        """)
        rows = cur.fetchall()

    result = {
        str(name).strip(): int(region_id)
        for region_id, name in rows
    }

    if len(result) != 25:
        raise RuntimeError(f"Expected 25 DB districts, got {len(result)}")

    return result


def verify_region_mapping(polygons, region_by_name):
    polygon_names = set(polygons["district_name"])
    db_names = set(region_by_name.keys())

    only_polygon = sorted(polygon_names - db_names)
    only_db = sorted(db_names - polygon_names)

    if only_polygon or only_db:
        raise RuntimeError(
            f"District mismatch\n"
            f"Only polygon: {only_polygon}\n"
            f"Only DB: {only_db}"
        )


def load_places(conn):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT
                p.id,
                p.name,
                p.district_region_id,
                r.name AS district_name,
                p.latitude,
                p.longitude,
                p.road_address,
                p.lot_address
            FROM places p
            LEFT JOIN regions r
              ON r.id = p.district_region_id
            ORDER BY p.id
        """)

        rows = cur.fetchall()

        cols = [
            d.name
            for d in cur.description
        ]

    return pd.DataFrame(rows, columns=cols)


def build_results(places, polygons, region_by_name):
    results = []

    usable = places[
        places["latitude"].notna()
        & places["longitude"].notna()
    ].copy()

    usable["latitude"] = usable["latitude"].astype(float)
    usable["longitude"] = usable["longitude"].astype(float)

    points = gpd.GeoDataFrame(
        usable,
        geometry=gpd.points_from_xy(
            usable["longitude"],
            usable["latitude"],
        ),
        crs="EPSG:4326",
    )

    joined = gpd.sjoin(
        points,
        polygons,
        how="left",
        predicate="intersects",
    )

    matched_by_place = defaultdict(list)

    for _, row in joined.iterrows():
        matched_name = row.get("district_name_right")

        if pd.notna(matched_name):
            matched_name = str(matched_name).strip()
            matched_region_id = region_by_name.get(matched_name)

            if matched_region_id is not None:
                matched_by_place[int(row["id"])].append(
                    (matched_region_id, matched_name)
                )

    for _, p in places.iterrows():
        place_id = int(p["id"])

        expected_region_id = (
            int(p["district_region_id"])
            if pd.notna(p["district_region_id"])
            else None
        )

        latitude = (
            float(p["latitude"])
            if pd.notna(p["latitude"])
            else None
        )

        longitude = (
            float(p["longitude"])
            if pd.notna(p["longitude"])
            else None
        )

        status = None
        reason = None
        matched_region_id = None
        matched_region_name = None

        if latitude is None or longitude is None:
            status = "UNKNOWN"
            reason = "MISSING_COORDINATE"

        elif expected_region_id is None:
            status = "UNKNOWN"
            reason = "MISSING_DISTRICT"

        else:
            matches = list(
                dict.fromkeys(
                    matched_by_place.get(place_id, [])
                )
            )

            expected_matches = [
                x
                for x in matches
                if x[0] == expected_region_id
            ]

            if expected_matches:
                status = "VALID"
                matched_region_id = expected_region_id
                matched_region_name = expected_matches[0][1]

            elif len(matches) == 0:
                status = "INVALID"
                reason = "OUTSIDE_SEOUL"

            elif len(matches) == 1:
                status = "INVALID"
                reason = "OUTSIDE_EXPECTED_DISTRICT"
                matched_region_id, matched_region_name = matches[0]

            else:
                status = "UNKNOWN"
                reason = "MULTIPLE_MATCH"

        results.append({
            "place_id": place_id,
            "place_name": p["name"],
            "expected_region_id": expected_region_id,
            "expected_region_name": p["district_name"],
            "matched_region_id": matched_region_id,
            "matched_region_name": matched_region_name,
            "latitude": latitude,
            "longitude": longitude,
            "status": status,
            "reason": reason,
            "road_address": p["road_address"],
            "lot_address": p["lot_address"],
        })

    return pd.DataFrame(results)


def print_report(results):
    print("\n===== SUMMARY =====")

    counts = Counter(results["status"])

    print("TOTAL   =", len(results))
    print("VALID   =", counts.get("VALID", 0))
    print("INVALID =", counts.get("INVALID", 0))
    print("UNKNOWN =", counts.get("UNKNOWN", 0))

    print("\n===== REASONS =====")
    print(
        results["reason"]
        .fillna("NONE")
        .value_counts()
        .to_string()
    )

    invalid = results[
        results["status"] == "INVALID"
    ]

    print("\n===== INVALID EXPECTED -> MATCHED =====")

    if invalid.empty:
        print("(none)")
    else:
        summary = (
            invalid.groupby(
                [
                    "expected_region_name",
                    "matched_region_name",
                    "reason",
                ],
                dropna=False,
            )
            .size()
            .reset_index(name="count")
            .sort_values("count", ascending=False)
        )

        print(summary.head(100).to_string(index=False))

    cols = [
        "place_id",
        "place_name",
        "expected_region_name",
        "matched_region_name",
        "latitude",
        "longitude",
        "road_address",
        "reason",
    ]

    print("\n===== INVALID SAMPLE =====")
    print(
        invalid[cols]
        .head(50)
        .to_string(index=False)
    )

    unknown = results[
        results["status"] == "UNKNOWN"
    ]

    print("\n===== UNKNOWN SAMPLE =====")
    print(
        unknown[cols]
        .head(50)
        .to_string(index=False)
    )


def apply_results(conn, results):
    sql = """
        INSERT INTO place_coordinate_validations (
            place_id,
            expected_district_region_id,
            matched_district_region_id,
            latitude,
            longitude,
            status,
            reason,
            validator_version,
            validated_at
        )
        VALUES (
            %s, %s, %s, %s, %s,
            %s, %s, %s, NOW()
        )
        ON CONFLICT (place_id)
        DO UPDATE SET
            expected_district_region_id =
                EXCLUDED.expected_district_region_id,
            matched_district_region_id =
                EXCLUDED.matched_district_region_id,
            latitude =
                EXCLUDED.latitude,
            longitude =
                EXCLUDED.longitude,
            status =
                EXCLUDED.status,
            reason =
                EXCLUDED.reason,
            validator_version =
                EXCLUDED.validator_version,
            validated_at =
                NOW()
    """

    rows = []

    for _, r in results.iterrows():
        rows.append(
            (
                int(r["place_id"]),
                int(r["expected_region_id"])
                if pd.notna(r["expected_region_id"])
                else None,
                int(r["matched_region_id"])
                if pd.notna(r["matched_region_id"])
                else None,
                r["latitude"],
                r["longitude"],
                r["status"],
                None if pd.isna(r["reason"]) else r["reason"],
                VALIDATOR_VERSION,
            )
        )

    batch_size = 5000

    with conn.cursor() as cur:
        for start in range(0, len(rows), batch_size):
            batch = rows[start:start + batch_size]
            cur.executemany(sql, batch)

            print(
                "upserted",
                min(start + batch_size, len(rows)),
                "/",
                len(rows),
            )

    conn.commit()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write validation results to DB",
    )
    args = parser.parse_args()

    print("Loading polygons...")
    polygons = load_polygons()
    print("Polygons:", len(polygons))
    print("CRS:", polygons.crs)

    url = load_db_url()

    with psycopg.connect(url) as conn:
        region_by_name = load_regions(conn)

        verify_region_mapping(
            polygons,
            region_by_name,
        )

        print("Region mapping: OK")

        print("Loading places...")
        places = load_places(conn)
        print("Places:", len(places))

        print("Validating...")
        results = build_results(
            places,
            polygons,
            region_by_name,
        )

        print_report(results)

        if args.apply:
            print("\n*** APPLY MODE ***")
            apply_results(conn, results)
            print("Done.")
        else:
            print("\nDRY RUN ONLY - DB unchanged.")


if __name__ == "__main__":
    main()
