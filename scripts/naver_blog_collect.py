import argparse
import html
import os
import re
import time
from datetime import datetime
from zoneinfo import ZoneInfo

import psycopg
import requests
from psycopg.rows import dict_row


NAVER_BLOG_URL = "https://naverapihub.apigw.ntruss.com/search/v1/blog"

NAVER_CLIENT_ID = os.environ["NAVER_API_CLIENT_ID"]
NAVER_CLIENT_SECRET = os.environ["NAVER_API_CLIENT_SECRET"]

DB_URL = os.environ.get("DIRECT_URL") or os.environ["DATABASE_URL"]

TAG_RE = re.compile(r"<[^>]+>")
BRACKET_RE = re.compile(r"\[[^\]]+\]")
PAREN_RE = re.compile(r"\([^)]*\)")
SPACE_RE = re.compile(r"\s+")


def clean_text(value):
    if not value:
        return None

    value = TAG_RE.sub("", value)
    value = html.unescape(value)
    value = value.strip()

    return value or None


def parse_postdate(value):
    if not value:
        return None

    dt = datetime.strptime(value, "%Y%m%d")
    return dt.replace(tzinfo=ZoneInfo("Asia/Seoul"))


def make_blog_fallback_query(name):
    value = name

    # Remove descriptive tags such as:
    # [유네스코 세계유산], [K드라마 촬영지]
    value = BRACKET_RE.sub(" ", value)

    # Remove parenthesized aliases/descriptions such as:
    # (실외), (Gangnam AN guesthouse), (Doonggle House)
    value = PAREN_RE.sub(" ", value)

    # Normalize separators.
    value = value.replace("·", " ")
    value = value.replace("/", " ")

    value = SPACE_RE.sub(" ", value).strip()

    return value


def fetch_blog_results(query):
    headers = {
        "X-NCP-APIGW-API-KEY-ID": NAVER_CLIENT_ID,
        "X-NCP-APIGW-API-KEY": NAVER_CLIENT_SECRET,
    }

    params = {
        "query": query,
        "display": 5,
        "start": 1,
        "sort": "date",
        "format": "json",
    }

    response = requests.get(
        NAVER_BLOG_URL,
        headers=headers,
        params=params,
        timeout=30,
    )

    response.raise_for_status()
    return response.json()


def get_place(conn, place_id):
    return conn.execute(
        """
        SELECT
            p.id,
            p.name,
            nst.search_term
        FROM places p
        JOIN naver_search_terms nst
          ON nst.place_id = p.id
        WHERE p.id = %s
          AND nst.is_active = TRUE
        ORDER BY nst.version DESC
        LIMIT 1
        """,
        (place_id,),
    ).fetchone()


def get_places(conn, limit):
    return conn.execute(
        """
        SELECT
            p.id,
            p.name,
            nst.search_term
        FROM naver_search_terms nst
        JOIN places p
          ON p.id = nst.place_id
        WHERE nst.is_active = TRUE
        ORDER BY p.id
        LIMIT %s
        """,
        (limit,),
    ).fetchall()


def get_empty_blog_places(conn):
    return conn.execute(
        """
        SELECT
            p.id,
            p.name,
            nst.search_term
        FROM naver_search_terms nst
        JOIN places p
          ON p.id = nst.place_id
        LEFT JOIN place_external_contents pec
          ON pec.place_id = p.id
         AND pec.content_type = 'NAVER_BLOG'
        WHERE nst.is_active = TRUE
        GROUP BY
            p.id,
            p.name,
            nst.search_term
        HAVING COUNT(pec.id) = 0
        ORDER BY p.id
        """
    ).fetchall()


def save_results(conn, place_id, items):
    saved = 0

    for item in items:
        url = item.get("link")

        if not url:
            continue

        conn.execute(
            """
            INSERT INTO place_external_contents (
                place_id,
                content_type,
                title,
                description,
                url,
                author,
                author_url,
                published_at,
                collected_at
            )
            VALUES (
                %s,
                'NAVER_BLOG',
                %s,
                %s,
                %s,
                %s,
                %s,
                %s,
                NOW()
            )
            ON CONFLICT (place_id, url)
            DO UPDATE SET
                title = EXCLUDED.title,
                description = EXCLUDED.description,
                author = EXCLUDED.author,
                author_url = EXCLUDED.author_url,
                published_at = EXCLUDED.published_at,
                collected_at = NOW()
            """,
            (
                place_id,
                clean_text(item.get("title")),
                clean_text(item.get("description")),
                url,
                clean_text(item.get("bloggername")),
                item.get("bloggerlink"),
                parse_postdate(item.get("postdate")),
            ),
        )

        saved += 1

    return saved


def collect_place(conn, place, query=None):
    actual_query = query or place["search_term"]

    print(
        f"[FETCH] place_id={place['id']} "
        f"name={place['name']} "
        f"query={actual_query}"
    )

    response = fetch_blog_results(actual_query)
    items = response.get("items", [])

    with conn.transaction():
        saved = save_results(
            conn,
            place["id"],
            items,
        )

    print(
        f"[NAVER] total={response.get('total')} "
        f"returned={len(items)} "
        f"saved/upserted={saved}"
    )

    return saved, len(items)


def collect_one(place_id):
    with psycopg.connect(DB_URL, row_factory=dict_row) as conn:
        place = get_place(conn, place_id)

        if not place:
            raise RuntimeError(
                f"No active Naver search term for place_id={place_id}"
            )

        collect_place(conn, place)


def collect_batch(limit):
    total_saved = 0
    success = 0
    failed = 0

    with psycopg.connect(DB_URL, row_factory=dict_row) as conn:
        places = get_places(conn, limit)

        print(f"[BATCH] target_places={len(places)}")

        for i, place in enumerate(places, start=1):
            try:
                print(f"\n[{i}/{len(places)}]")

                saved, _ = collect_place(conn, place)

                total_saved += saved
                success += 1

            except Exception as e:
                failed += 1
                print(
                    f"[ERROR] place_id={place['id']} "
                    f"{type(e).__name__}: {e}"
                )

            time.sleep(0.1)

    print("\n========== SUMMARY ==========")
    print(f"target_places={len(places)}")
    print(f"success={success}")
    print(f"failed={failed}")
    print(f"saved/upserted={total_saved}")


def retry_empty():
    total_saved = 0
    success = 0
    still_empty = 0
    failed = 0

    with psycopg.connect(DB_URL, row_factory=dict_row) as conn:
        places = get_empty_blog_places(conn)

        print(f"[RETRY EMPTY] target_places={len(places)}")

        for i, place in enumerate(places, start=1):
            try:
                fallback_query = make_blog_fallback_query(
                    place["search_term"]
                )

                print(
                    f"\n[{i}/{len(places)}] "
                    f"original={place['search_term']}"
                )
                print(f"[FALLBACK] {fallback_query}")

                if not fallback_query:
                    print("[SKIP] fallback query is empty")
                    still_empty += 1
                    continue

                saved, returned = collect_place(
                    conn,
                    place,
                    query=fallback_query,
                )

                total_saved += saved

                if returned > 0:
                    success += 1
                else:
                    still_empty += 1

            except Exception as e:
                failed += 1
                print(
                    f"[ERROR] place_id={place['id']} "
                    f"{type(e).__name__}: {e}"
                )

            time.sleep(0.1)

    print("\n======= RETRY SUMMARY =======")
    print(f"target_places={len(places)}")
    print(f"success_with_results={success}")
    print(f"still_empty={still_empty}")
    print(f"failed={failed}")
    print(f"saved/upserted={total_saved}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()

    group = parser.add_mutually_exclusive_group(required=True)

    group.add_argument(
        "--place-id",
        type=int,
    )

    group.add_argument(
        "--limit",
        type=int,
    )

    group.add_argument(
        "--retry-empty",
        action="store_true",
    )

    args = parser.parse_args()

    if args.place_id is not None:
        collect_one(args.place_id)

    elif args.limit is not None:
        collect_batch(args.limit)

    elif args.retry_empty:
        retry_empty()