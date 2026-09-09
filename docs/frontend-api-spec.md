# 고요행 사용자 앱 API 명세서 v1

> 최종 수정: 2026-09-09  
> 대상: Flutter 사용자 앱 ↔ NestJS 백엔드 연동  
> 범위: 현재 구현 완료된 사용자 앱 API만 포함  
> 제외: `/external-api/*` 데이터 적재용 API, GAP Score, 트렌드, 즐겨찾기, 메인 통계

---

## 1. 기본 정보

### Base URL

```text
http://{SERVER_HOST}:3000/api/v1
```

로컬 개발 환경:

```text
http://localhost:3000/api/v1
```

Swagger:

```text
http://localhost:3000/api-docs
```

### 인증 방식

인증이 필요한 API는 로그인 후 발급받은 JWT Access Token을 사용한다.

```http
Authorization: Bearer {accessToken}
```

Swagger의 `Authorize` 입력창에는 `Bearer`를 붙이지 않고 `accessToken` 값만 입력한다.

---

## 2. Auth

> Auth / Users 데이터는 현재 PostgreSQL에 저장된다.

### 2.1 아이디 중복 확인

```http
GET /auth/check-username?username={username}
```

| 이름 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `username` | string | O | 중복 확인할 아이디 |

예시:

```http
GET /api/v1/auth/check-username?username=yerin123
```

### 2.2 회원가입

```http
POST /auth/signup
```

Request Body:

```json
{
  "username": "yerin123",
  "password": "password123!",
  "realName": "조예린",
  "email": "yerin@example.com",
  "phone": "010-1234-5678",
  "birthDate": "2002-05-20",
  "gender": "FEMALE"
}
```

`gender`: `MALE` 또는 `FEMALE`

Success `201`:

```json
{
  "userId": 1,
  "username": "yerin123",
  "realName": "조예린",
  "message": "회원가입이 완료되었습니다."
}
```

| Status | 설명 |
|---|---|
| `400` | 회원가입 입력값이 올바르지 않음 |
| `409` | 이미 사용 중인 아이디 또는 이메일 |

### 2.3 로그인

```http
POST /auth/login
```

Request Body:

```json
{
  "username": "yerin123",
  "password": "password123!"
}
```

Success `200`:

```json
{
  "accessToken": "JWT_TOKEN",
  "user": {
    "id": 1,
    "username": "yerin123",
    "realName": "조예린"
  }
}
```

| Status | 설명 |
|---|---|
| `400` | 로그인 입력값이 올바르지 않음 |
| `401` | 아이디 또는 비밀번호 불일치 |

---

## 3. Users

> 아래 API는 JWT 인증이 필요하다. 사용자 정보는 PostgreSQL에 저장된다.

### 3.1 내 정보 조회

```http
GET /users/me
```

Success `200`:

```json
{
  "id": 1,
  "username": "yerin123",
  "realName": "조예린",
  "email": "yerin@example.com",
  "phone": "010-1234-5678",
  "birthDate": "2002-05-20",
  "gender": "FEMALE",
  "promotionNotificationEnabled": false,
  "nearbyNotificationEnabled": false,
  "recordNotificationEnabled": false
}
```

> 알림 설정의 현재 DB 기본값은 모두 `false`다.

### 3.2 내 정보 수정

```http
PATCH /users/me
```

```json
{
  "realName": "예린",
  "birthDate": "2002-05-20",
  "gender": "FEMALE"
}
```

> `username`은 현재 수정 대상이 아니다.

### 3.3 알림 설정 수정

```http
PATCH /users/me/settings
```

```json
{
  "promotionNotificationEnabled": false,
  "nearbyNotificationEnabled": true,
  "recordNotificationEnabled": true
}
```

### 3.4 비밀번호 변경

```http
PATCH /users/me/password
```

```json
{
  "currentPassword": "password123!",
  "newPassword": "newPassword123!"
}
```

새 비밀번호 최소 길이: 8자.

### 3.5 회원탈퇴

```http
DELETE /users/me
```

```json
{
  "message": "회원탈퇴가 완료되었습니다."
}
```

현재 soft delete 방식이며 탈퇴 사용자는 `status = DELETED`로 처리된다.

---

## 4. Regions

> 지역 정보는 PostgreSQL의 실제 데이터를 사용한다.

### 4.1 지역 목록 조회

```http
GET /regions
```

Response Item 예시:

```json
{
  "id": 1,
  "parentId": null,
  "regionType": "PROVINCE",
  "name": "서울특별시"
}
```

> 최종 MVP는 서울특별시 + 서울 25개 구 중심이다. 프론트에서 `regionId`를 하드코딩하지 않는다.

### 4.2 지역별 스팟 수 조회

```http
GET /regions/{regionId}/spot-counts
```

`PROVINCE` 조회 예시:

```json
{
  "regionId": 1,
  "regionName": "서울특별시",
  "spotCount": 5234,
  "children": [
    {
      "regionId": 2,
      "regionName": "종로구",
      "spotCount": 312
    }
  ]
}
```

`DISTRICT` 직접 조회 예시:

```json
{
  "regionId": 2,
  "regionName": "종로구",
  "spotCount": 312,
  "children": []
}
```

| Status | 설명 |
|---|---|
| `404` | 지역을 찾을 수 없음 |

---

## 5. Categories

> 카테고리 정보는 PostgreSQL의 실제 활성 데이터를 사용한다.

### 5.1 장소 카테고리 목록 조회

```http
GET /categories
```

Response Item 예시:

```json
{
  "id": 12,
  "parentId": null,
  "code": "CAFE",
  "name": "카페",
  "level": 1,
  "isActive": true
}
```

`전체`는 별도 category가 아니므로 `categoryId` 없이 장소 API를 호출한다.

> 프론트에서 `categoryId`를 하드코딩하지 않는다.

---

## 6. Places

> 장소 정보는 PostgreSQL의 실제 데이터를 사용한다.

### 6.1 장소 목록 조회

```http
GET /places
```

| 이름 | 타입 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|
| `regionId` | number | X | - | 지역 ID |
| `categoryId` | number | X | - | 카테고리 ID |
| `page` | number | X | `1` | 페이지 번호 |
| `limit` | number | X | `20` | 페이지당 장소 개수, 최대 100 |

호출 예시:

```http
GET /api/v1/places?page=1&limit=20
GET /api/v1/places?regionId=2&page=1&limit=20
GET /api/v1/places?categoryId=12&page=1&limit=20
GET /api/v1/places?regionId=2&categoryId=12&page=2&limit=20
```

Success `200` 예시:

```json
{
  "items": [
    {
      "id": 6859,
      "name": "장소명",
      "categoryId": 12,
      "districtRegionId": 2,
      "adminDongRegionId": null,
      "legalDongRegionId": null,
      "roadAddress": "서울특별시 ...",
      "lotAddress": null,
      "postalCode": "03157",
      "latitude": 37.5708519,
      "longitude": 126.9799189,
      "phone": null,
      "homepage": null,
      "ownerIntro": null,
      "status": "ACTIVE"
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 384,
  "totalPages": 20
}
```

> **중요:** 기존처럼 배열 자체를 반환하지 않는다. 장소 목록은 반드시 `response.items`에서 읽는다.

### 6.2 장소 상세 조회

```http
GET /places/{id}
```

Success `200` 예시:

```json
{
  "id": 6859,
  "name": "장소명",
  "categoryId": 12,
  "districtRegionId": 2,
  "adminDongRegionId": null,
  "legalDongRegionId": null,
  "roadAddress": "서울특별시 ...",
  "lotAddress": null,
  "postalCode": "03157",
  "latitude": 37.5708519,
  "longitude": 126.9799189,
  "phone": null,
  "homepage": null,
  "ownerIntro": null,
  "status": "ACTIVE",
  "images": [],
  "operatingHours": [],
  "isOpenNow": false,
  "benefits": [],
  "availableIngredients": [
    {
      "id": 1,
      "name": "쌀",
      "imageUrl": null,
      "rarity": null,
      "quantity": 2,
      "rewardRule": "EVERY_VISIT"
    }
  ],
  "verification": {
    "enabled": true,
    "controlMode": "AUTO",
    "hoursMode": "SAME_AS_OPERATING",
    "codeValidMinutes": 30
  }
}
```

`dayOfWeek`:

| 값 | 요일 |
|---:|---|
| 1 | 월요일 |
| 2 | 화요일 |
| 3 | 수요일 |
| 4 | 목요일 |
| 5 | 금요일 |
| 6 | 토요일 |
| 7 | 일요일 |

`isOpenNow`는 한국 시간(`Asia/Seoul`) 기준으로 주간 영업시간과 특별 영업/휴무 정보를 반영해 백엔드에서 계산한다.

| Status | 설명 |
|---|---|
| `404` | 장소를 찾을 수 없음 |

### 6.3 장소 방문 여부 조회

> JWT 인증 필요

```http
GET /places/{placeId}/visit-status
```

해당 사용자가 이 장소에서 `VERIFIED` 방문 인증 기록을 하나라도 가지고 있으면 `visited = true`를 반환한다.

```json
{
  "placeId": 6859,
  "visited": true
}
```

방문한 적이 없는 경우:

```json
{
  "placeId": 6861,
  "visited": false
}
```

| Status | 설명 |
|---|---|
| `401` | 로그인이 필요함 |
| `404` | 장소를 찾을 수 없음 |

> `{placeId}`는 방문 인증 세션 ID가 아니라 장소 ID다.

---

## 7. Visit Verifications

> 아래 API는 JWT 인증이 필요하다. 방문 인증 데이터는 PostgreSQL에 저장된다.

### 7.1 방문 인증 세션 생성

```http
POST /visit-verifications
```

Request Body:

```json
{
  "placeId": 6859,
  "arrivalOptionMinutes": 30
}
```

`arrivalOptionMinutes`: `10`, `30`, `60`

Success `201`:

```json
{
  "id": 8,
  "userId": 2,
  "placeId": 6859,
  "arrivalOptionMinutes": 30,
  "expectedArrivalAt": "2026-09-08T14:54:20.835Z",
  "verificationCode": "745959",
  "issuedAt": "2026-09-08T14:24:20.835Z",
  "expiresAt": "2026-09-08T15:24:20.835Z",
  "status": "ISSUED",
  "verifiedAt": null,
  "failReason": null,
  "createdAt": "2026-09-08T14:24:20.836Z"
}
```

| Status | 설명 |
|---|---|
| `400` | 잘못된 도착 시간 또는 방문 인증 불가능한 장소 |
| `401` | 로그인이 필요함 |
| `404` | 장소를 찾을 수 없음 |

### 7.2 방문 인증 세션 조회

```http
GET /visit-verifications/{verificationId}
```

- 자신이 생성한 방문 인증 세션만 조회 가능
- 만료 시간이 지난 `ISSUED` 세션은 조회 시 `EXPIRED` 처리

| Status | 설명 |
|---|---|
| `401` | 로그인이 필요함 |
| `404` | 방문 인증 세션을 찾을 수 없음 |

### 7.3 방문 인증 코드 검증 + 재료 지급

```http
POST /visit-verifications/{verificationId}/verify
```

Request Body:

```json
{
  "verificationCode": "745959"
}
```

Success `200`:

```json
{
  "id": 8,
  "userId": 2,
  "placeId": 6859,
  "arrivalOptionMinutes": 30,
  "expectedArrivalAt": "2026-09-08T14:54:20.835Z",
  "verificationCode": "745959",
  "issuedAt": "2026-09-08T14:24:20.835Z",
  "expiresAt": "2026-09-08T15:24:20.835Z",
  "status": "VERIFIED",
  "verifiedAt": "2026-09-08T14:24:46.388Z",
  "failReason": null,
  "createdAt": "2026-09-08T14:24:20.836Z"
}
```

방문 인증 성공 시 다음 작업을 하나의 DB 트랜잭션으로 처리한다.

1. `VisitVerification.status`: `ISSUED → VERIFIED`
2. 해당 장소의 활성화된 `EVERY_VISIT` 재료 보상 조회
3. `UserIngredient` 보유 수량 증가
4. `IngredientTransaction` 지급 이력 생성 (`transactionType = VISIT_REWARD`)

현재 자동 지급되는 reward rule:

```text
EVERY_VISIT
```

DB에는 아래 규칙도 존재하지만 현재 자동 지급 로직에는 아직 적용되지 않았다.

```text
FIRST_VERIFIED_VISIT
CAMPAIGN
```

| Status | 설명 |
|---|---|
| `400` | 인증 코드 불일치 / 인증 만료 / 이미 처리된 인증 |
| `401` | 로그인이 필요함 |
| `404` | 방문 인증 세션을 찾을 수 없음 |

> **중요:** `{verificationId}`는 `placeId`가 아니다. 세션 생성 응답의 `id`를 사용한다.

---

## 8. 프론트 연동 시 주의사항

1. `Users`, `Regions`, `Categories`, `Places`, `Visit Verifications`는 PostgreSQL 기반이다.
2. `regionId`, `categoryId`, `placeId`, `verificationId`를 프론트에 임의의 고정값으로 하드코딩하지 않는다.
3. `/places`는 페이지네이션 응답을 사용하므로 장소 목록은 `response.items`에서 읽는다.
4. 인증 API는 `Authorization: Bearer {accessToken}` 헤더를 사용한다.
5. Swagger의 `Authorize`에는 토큰 값만 입력한다.
6. 날짜/시간 응답은 ISO 8601 문자열 기준으로 처리한다.
7. 장소 방문 여부는 `GET /places/{placeId}/visit-status`에서 확인한다.
8. 방문 인증 성공 시 현재는 `EVERY_VISIT` 보상만 자동 지급된다.
9. GAP Score, 트렌드, 즐겨찾기, 메인 통계 API는 아직 구현되지 않았다.
10. `/external-api/*`는 데이터 적재용 내부 API로 사용자 앱에서 직접 호출하지 않는다.

---

## 9. 현재 구현 API 요약

| Method | Endpoint | 인증 | 설명 |
|---|---|:---:|---|
| GET | `/auth/check-username` | X | 아이디 중복 확인 |
| POST | `/auth/signup` | X | 회원가입 |
| POST | `/auth/login` | X | 로그인 |
| GET | `/users/me` | O | 내 정보 조회 |
| PATCH | `/users/me` | O | 내 정보 수정 |
| PATCH | `/users/me/settings` | O | 알림 설정 수정 |
| PATCH | `/users/me/password` | O | 비밀번호 변경 |
| DELETE | `/users/me` | O | 회원탈퇴 |
| GET | `/regions` | X | 지역 목록 조회 |
| GET | `/regions/{regionId}/spot-counts` | X | 지역별 스팟 수 조회 |
| GET | `/categories` | X | 장소 카테고리 목록 조회 |
| GET | `/places` | X | 장소 목록 / 필터 / 페이지네이션 |
| GET | `/places/{id}` | X | 장소 상세 조회 |
| GET | `/places/{placeId}/visit-status` | O | 장소 방문 여부 조회 |
| POST | `/visit-verifications` | O | 방문 인증 세션 생성 |
| GET | `/visit-verifications/{verificationId}` | O | 방문 인증 세션 조회 |
| POST | `/visit-verifications/{verificationId}/verify` | O | 방문 인증 검증 + 재료 지급 |

---

## 10. 아직 미구현 / 추가 예정

- 메인 화면 통계
  - 이번 달 방문 횟수
  - 모은 재료 개수
  - 인증 완료 횟수
  - 만든 음식 개수
  - 방문 횟수 최다 지역 TOP3
- GAP Score 및 GAP 관련 조회 API
- 즐겨찾기 API
- `FIRST_VERIFIED_VISIT` 보상 규칙 처리
- `CAMPAIGN` 보상 규칙 처리
- 트렌드 요약
- AI 관심 포인트
- 네이버 블로그 링크
- 함께 검색하는 키워드

---

## 11. 현재 완료 상태

```text
Auth / Users PostgreSQL 연동              완료
Regions / Categories PostgreSQL 연동      완료
Places PostgreSQL 연동                    완료
장소 목록 페이지네이션                    완료
장소 상세 / 이미지 / 영업시간 / 혜택       완료
획득 가능 재료 조회                       완료
현재 영업 여부(isOpenNow) 계산             완료
지역별 spot count                         완료
방문 인증 생성 / 조회 DB 저장              완료
방문 인증 코드 검증 및 VERIFIED 처리        완료
인증 성공 후 EVERY_VISIT 재료 지급          완료
재료 보유량 증가 / 지급 이력 저장           완료
장소 방문 여부 조회                        완료
```
