import json
import os
import time
from typing import Any, Dict, Optional

import psycopg
import requests
from dotenv import load_dotenv
from psycopg.rows import dict_row
from urllib.parse import unquote

# ============================================================
# CONFIG
# ============================================================

load_dotenv()

DATABASE_URL = os.getenv("DIRECT_URL") or os.getenv("DATABASE_URL")
SERVICE_KEY_RAW = os.getenv("PUBLIC_DATA_SERVICE_KEY")
SERVICE_KEY = unquote(SERVICE_KEY_RAW) if SERVICE_KEY_RAW else None

TOUR_BASE_URL = "https://apis.data.go.kr/B551011/KorService2"
ENDPOINT = "detailIntro2"

REQUEST_DELAY_SECONDS = 0.15


if not DATABASE_URL:
    raise RuntimeError("DIRECT_URL or DATABASE_URL is not set")

if not SERVICE_KEY:
    raise RuntimeError("PUBLIC_DATA_SERVICE_KEY is not set")


# ============================================================
# DB
# ============================================================

def db():
    return psycopg.connect(
        DATABASE_URL,
        row_factory=dict_row,
    )


def get_tour_source_id(conn) -> int:
    row = conn.execute(
        """
        SELECT id
        FROM external_sources
        WHERE code = 'TOUR_API'
        """
    ).fetchone()

    if not row:
        raise RuntimeError(
            "external_sources row with code='TOUR_API' was not found"
        )

    return row["id"]


# ============================================================
# TARGET SELECTION
# ============================================================

def get_pending_places(conn):
    """
    areaBasedList2에 존재하는 서울 TourAPI 장소 중
    아직 detailIntro2 정상 응답을 RAW에 저장하지 않은 장소만 가져온다.

    content_id / content_type_id 컬럼이 있으면 그것을 사용하고,
    혹시 NULL이면 response_payload의 contentid/contenttypeid를 fallback으로 사용한다.
    """

    return conn.execute(
        """
        WITH latest_area AS (
            SELECT DISTINCT ON (
                COALESCE(content_id, response_payload->>'contentid')
            )
                COALESCE(
                    content_id,
                    response_payload->>'contentid'
                ) AS content_id,

                COALESCE(
                    content_type_id,
                    response_payload->>'contenttypeid'
                ) AS content_type_id

            FROM raw_tour_api

            WHERE endpoint = 'areaBasedList2'
              AND COALESCE(
                    content_id,
                    response_payload->>'contentid'
                  ) IS NOT NULL

            ORDER BY
                COALESCE(content_id, response_payload->>'contentid'),
                fetched_at DESC,
                id DESC
        )

        SELECT
            la.content_id,
            la.content_type_id

        FROM latest_area la

        WHERE la.content_type_id IS NOT NULL
          AND la.content_type_id <> ''

          AND NOT EXISTS (
              SELECT 1
              FROM raw_tour_api intro
              WHERE intro.endpoint = 'detailIntro2'
                AND intro.content_id = la.content_id
          )

        ORDER BY la.content_id
        """
    ).fetchall()


# ============================================================
# TOUR API
# ============================================================

def call_detail_intro(
    content_id: str,
    content_type_id: str,
) -> requests.Response:

    params = {
        "serviceKey": SERVICE_KEY,
        "MobileOS": "ETC",
        "MobileApp": "Goyohaeng",
        "_type": "json",
        "contentId": content_id,
        "contentTypeId": content_type_id,
        "numOfRows": 10,
        "pageNo": 1,
    }

    return requests.get(
        f"{TOUR_BASE_URL}/{ENDPOINT}",
        params=params,
        timeout=30,
    )


def try_parse_json(
    response: requests.Response,
) -> Optional[Dict[str, Any]]:

    try:
        return response.json()
    except ValueError:
        return None


def extract_result_code(
    payload: Optional[Dict[str, Any]],
) -> Optional[str]:

    if not payload:
        return None

    response = payload.get("response")

    if not isinstance(response, dict):
        return None

    header = response.get("header")

    if not isinstance(header, dict):
        return None

    result_code = header.get("resultCode")

    if result_code is None:
        return None

    return str(result_code)


def extract_result_message(
    payload: Optional[Dict[str, Any]],
) -> Optional[str]:

    if not payload:
        return None

    response = payload.get("response")

    if not isinstance(response, dict):
        return None

    header = response.get("header")

    if not isinstance(header, dict):
        return None

    result_msg = header.get("resultMsg")

    if result_msg is None:
        return None

    return str(result_msg)


def is_quota_exceeded(
    response: requests.Response,
    payload: Optional[Dict[str, Any]],
) -> bool:
    """
    공공데이터포털의 서비스 요청 제한 횟수 초과를 감지한다.

    공식 에러 코드:
        22
        LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR

    공공데이터포털 오류는 JSON 요청 중에도 XML/text로
    반환될 수 있으므로 JSON resultCode와 response text를 모두 검사한다.
    """

    if extract_result_code(payload) == "22":
        return True

    text = response.text.upper()

    markers = [
        "LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS",
        "LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR",
        "<RETURNAUTHMSG>LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS",
        "<RETURNREASONCODE>22</RETURNREASONCODE>",
        "<RESULTCODE>22</RESULTCODE>",
        "서비스 요청 제한 횟수 초과",
    ]

    return any(marker.upper() in text for marker in markers)


def is_api_success(
    payload: Optional[Dict[str, Any]],
) -> bool:

    return extract_result_code(payload) == "0000"


# ============================================================
# RAW INSERT
# ============================================================

def insert_raw(
    conn,
    source_id: int,
    content_id: str,
    content_type_id: str,
    request_payload: Dict[str, Any],
    response_payload: Dict[str, Any],
):

    conn.execute(
        """
        INSERT INTO raw_tour_api (
            source_id,
            endpoint,
            content_id,
            content_type_id,
            request_payload,
            response_payload,
            fetched_at
        )
        VALUES (
            %s,
            'detailIntro2',
            %s,
            %s,
            %s::jsonb,
            %s::jsonb,
            NOW()
        )
        """,
        (
            source_id,
            content_id,
            content_type_id,
            json.dumps(
                request_payload,
                ensure_ascii=False,
            ),
            json.dumps(
                response_payload,
                ensure_ascii=False,
            ),
        ),
    )


# ============================================================
# MAIN
# ============================================================

def main():

    attempted = 0
    saved = 0
    no_data = 0
    failed = 0

    with db() as conn:

        source_id = get_tour_source_id(conn)

        targets = get_pending_places(conn)

        print()
        print("========================================")
        print(" TourAPI detailIntro2 sync")
        print("========================================")
        print(f"pending places : {len(targets)}")
        print()

        if not targets:
            print("[DONE] No pending detailIntro2 places.")
            return

        for index, row in enumerate(targets, start=1):

            content_id = row["content_id"]
            content_type_id = row["content_type_id"]

            request_payload = {
                "contentId": content_id,
                "contentTypeId": content_type_id,
                "MobileOS": "ETC",
                "MobileApp": "Goyohaeng",
                "_type": "json",
                "numOfRows": 10,
                "pageNo": 1,
            }

            attempted += 1

            try:
                response = call_detail_intro(
                    content_id=content_id,
                    content_type_id=content_type_id,
                )

            except requests.RequestException as exc:

                failed += 1

                print(
                    f"[ERROR] "
                    f"{index}/{len(targets)} "
                    f"contentId={content_id} "
                    f"request failed: {exc}"
                )

                time.sleep(REQUEST_DELAY_SECONDS)
                continue

            payload = try_parse_json(response)

            # ------------------------------------------------
            # QUOTA EXCEEDED
            # ------------------------------------------------

            if is_quota_exceeded(response, payload):

                print()
                print("========================================")
                print("[STOP] TourAPI daily quota exceeded.")
                print("[STOP] resultCode = 22")
                print("========================================")
                print(f"attempted : {attempted}")
                print(f"saved     : {saved}")
                print(f"no_data   : {no_data}")
                print(f"failed    : {failed}")
                print()
                print(
                    "Run the same command again after "
                    "the TourAPI daily quota resets."
                )
                print()

                return

            # ------------------------------------------------
            # HTTP ERROR
            # ------------------------------------------------
            if response.status_code != 200:

                failed += 1

                print(
                    f"[ERROR] "
                    f"{index}/{len(targets)} "
                    f"contentId={content_id} "
                    f"HTTP={response.status_code}"
                )

                print("[ERROR BODY]")
                print(response.text[:2000])
                print()

                # 인증/권한 계열 HTTP 오류가 반복되면
                # 2077건을 계속 낭비하지 않고 즉시 종료한다.
                if response.status_code in (401, 403):
                    print(
                        "[STOP] Authentication/authorization HTTP error. "
                        "Stopping immediately."
                    )
                    return

                time.sleep(REQUEST_DELAY_SECONDS)
                continue

            # ------------------------------------------------
            # NON-JSON
            # ------------------------------------------------

            if payload is None:

                failed += 1

                print(
                    f"[ERROR] "
                    f"{index}/{len(targets)} "
                    f"contentId={content_id} "
                    f"non-JSON response"
                )

                time.sleep(REQUEST_DELAY_SECONDS)
                continue

            # ------------------------------------------------
            # TOUR API ERROR
            # ------------------------------------------------

            if not is_api_success(payload):

                failed += 1

                print(
                    f"[ERROR] "
                    f"{index}/{len(targets)} "
                    f"contentId={content_id} "
                    f"resultCode={extract_result_code(payload)} "
                    f"resultMsg={extract_result_message(payload)}"
                )

                time.sleep(REQUEST_DELAY_SECONDS)
                continue

            # ------------------------------------------------
            # SUCCESS
            # ------------------------------------------------

            body = (
                payload
                .get("response", {})
                .get("body", {})
            )

            total_count = body.get("totalCount", 0)

            # 중요:
            # 정상 API 응답이면 totalCount=0이어도 RAW에 저장한다.
            #
            # 저장하지 않으면 다음 날 실행 시 이 장소를
            # 다시 미수집 장소로 판단해서 quota를 계속 낭비한다.
            insert_raw(
                conn=conn,
                source_id=source_id,
                content_id=content_id,
                content_type_id=content_type_id,
                request_payload=request_payload,
                response_payload=payload,
            )

            conn.commit()

            saved += 1

            try:
                has_data = int(total_count or 0) > 0
            except (TypeError, ValueError):
                has_data = False

            if has_data:
                status = "OK"
            else:
                status = "NO_DATA"
                no_data += 1

            print(
                f"[{index}/{len(targets)}] "
                f"contentId={content_id} "
                f"type={content_type_id} "
                f"{status}"
            )

            time.sleep(REQUEST_DELAY_SECONDS)

    print()
    print("========================================")
    print("[DONE] All pending detailIntro2 calls finished.")
    print("========================================")
    print(f"attempted : {attempted}")
    print(f"saved     : {saved}")
    print(f"no_data   : {no_data}")
    print(f"failed    : {failed}")
    print()


if __name__ == "__main__":
    main()