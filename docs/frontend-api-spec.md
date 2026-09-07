# 고요행 사용자 앱 API 명세서 v1

> 최종 수정: 2026-09-07  
> 대상: Flutter 사용자 앱 ↔ NestJS 백엔드 연동  
> 범위: 현재 구현 완료된 API만 포함  
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

---

## 2. Auth

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

로그인 성공 후 `accessToken`을 저장하고 인증 필요 API 요청 시:

```http
Authorization: Bearer {accessToken}
```

---

## 3. Users

> 아래 API는 JWT 인증이 필요하다.

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
  "promotionNotificationEnabled": true,
  "nearbyNotificationEnabled": true,
  "recordNotificationEnabled": true
}
```

### 3.2 내 정보 수정

```http
PATCH /users/me
```

Request Body (모든 필드 선택):

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

Success:

```json
{
  "message": "회원탈퇴가 완료되었습니다."
}
```

현재 soft delete 방식.

---

## 4. Regions

### 4.1 지역 목록 조회

```http
GET /regions
```

현재 테스트 응답 예시:

```json
[
  {
    "id": 1,
    "parentId": null,
    "regionType": "PROVINCE",
    "name": "전라남도"
  },
  {
    "id": 2,
    "parentId": 1,
    "regionType": "DISTRICT",
    "name": "담양군"
  }
]
```

> 현재는 테스트용 임시 데이터다. 최종 MVP는 서울특별시 + 서울 25개 구 중심으로 변경될 예정이다.  
> 프론트에서 `regionId`를 고정값으로 하드코딩하지 않는다.

---

## 5. Categories

### 5.1 장소 카테고리 목록 조회

```http
GET /categories
```

Success `200`:

```json
[
  {
    "id": 1,
    "parentId": null,
    "code": "FOOD",
    "name": "식당",
    "level": 1,
    "isActive": true
  },
  {
    "id": 2,
    "parentId": null,
    "code": "CAFE",
    "name": "카페",
    "level": 1,
    "isActive": true
  },
  {
    "id": 3,
    "parentId": null,
    "code": "ACTIVITY",
    "name": "액티비티",
    "level": 1,
    "isActive": true
  }
]
```

Frontend 표시 예시:

```text
전체 | 식당 | 카페 | 액티비티
```

`전체`는 별도 category가 아니므로 `categoryId` 없이 장소 API를 호출한다.

---

## 6. Places

### 6.1 장소 목록 조회

```http
GET /places
```

| 이름 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `regionId` | number | X | 지역 ID |
| `categoryId` | number | X | 카테고리 ID |

호출 예시:

```http
GET /api/v1/places
GET /api/v1/places?regionId=2
GET /api/v1/places?categoryId=3
GET /api/v1/places?regionId=2&categoryId=3
```

Response Item:

```json
{
  "id": 1,
  "name": "담양 죽녹원",
  "categoryId": 3,
  "districtRegionId": 2,
  "adminDongRegionId": null,
  "legalDongRegionId": null,
  "roadAddress": "전라남도 담양군 담양읍 죽녹원로 119",
  "lotAddress": null,
  "postalCode": null,
  "latitude": 35.3251,
  "longitude": 126.9883,
  "phone": "061-380-2680",
  "homepage": null,
  "ownerIntro": "대나무 숲길을 걸으며 쉬어갈 수 있는 공간입니다.",
  "status": "ACTIVE"
}
```

> 현재 장소 데이터는 테스트용 임시 데이터다.

### 6.2 장소 상세 조회

```http
GET /places/{id}
```

Success `200`:

```json
{
  "id": 1,
  "name": "담양 죽녹원",
  "categoryId": 3,
  "districtRegionId": 2,
  "adminDongRegionId": null,
  "legalDongRegionId": null,
  "roadAddress": "전라남도 담양군 담양읍 죽녹원로 119",
  "lotAddress": null,
  "postalCode": null,
  "latitude": 35.3251,
  "longitude": 126.9883,
  "phone": "061-380-2680",
  "homepage": null,
  "ownerIntro": "대나무 숲길을 걸으며 쉬어갈 수 있는 공간입니다.",
  "status": "ACTIVE",
  "images": [
    {
      "id": 1,
      "placeId": 1,
      "originalUrl": "https://example.com/image.jpg",
      "thumbnailUrl": "https://example.com/thumb.jpg",
      "displayOrder": 1
    }
  ],
  "operatingHours": [
    {
      "dayOfWeek": 1,
      "isClosed": false,
      "openTime": "09:00",
      "closeTime": "18:00",
      "breakStartTime": null,
      "breakEndTime": null
    }
  ],
  "benefits": [
    {
      "id": 1,
      "title": "방문 인증 혜택",
      "description": "방문 인증 시 지역 재료를 획득할 수 있습니다."
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

Error:

| Status | 설명 |
|---|---|
| `404` | 장소를 찾을 수 없음 |

---

## 7. Visit Verifications

> 아래 API는 JWT 인증이 필요하다.

### 7.1 방문 인증 세션 생성

```http
POST /visit-verifications
```

Request Body:

```json
{
  "placeId": 1,
  "arrivalOptionMinutes": 30
}
```

`arrivalOptionMinutes`: `10`, `30`, `60`

Success `201`:

```json
{
  "id": 1,
  "userId": 1,
  "placeId": 1,
  "arrivalOptionMinutes": 30,
  "expectedArrivalAt": "2026-09-07T13:00:00.000Z",
  "verificationCode": "583214",
  "issuedAt": "2026-09-07T12:30:00.000Z",
  "expiresAt": "2026-09-07T13:30:00.000Z",
  "status": "ISSUED",
  "verifiedAt": null,
  "failReason": null,
  "createdAt": "2026-09-07T12:30:00.000Z"
}
```

| Status | 설명 |
|---|---|
| `400` | 잘못된 도착 시간 또는 방문 인증 불가능한 장소 |
| `401` | 로그인이 필요함 |
| `404` | 장소를 찾을 수 없음 |

### 7.2 방문 인증 세션 조회

```http
GET /visit-verifications/{id}
```

Success `200`:

```json
{
  "id": 1,
  "userId": 1,
  "placeId": 1,
  "arrivalOptionMinutes": 30,
  "expectedArrivalAt": "2026-09-07T13:00:00.000Z",
  "verificationCode": "583214",
  "issuedAt": "2026-09-07T12:30:00.000Z",
  "expiresAt": "2026-09-07T13:30:00.000Z",
  "status": "ISSUED",
  "verifiedAt": null,
  "failReason": null,
  "createdAt": "2026-09-07T12:30:00.000Z"
}
```

- 자신이 생성한 방문 인증 세션만 조회 가능
- 만료 시간이 지난 `ISSUED` 세션은 조회 시 `EXPIRED` 처리

| Status | 설명 |
|---|---|
| `401` | 로그인이 필요함 |
| `404` | 방문 인증 세션을 찾을 수 없음 |

---

## 8. 프론트 연동 시 주의사항

1. `Regions`, `Categories`, `Places`, `Visit Verifications`의 일부 데이터는 아직 메모리 기반이다.
2. PostgreSQL 연동 후 실제 `regionId`, `categoryId`, `placeId`가 변경될 수 있다.
3. 프론트에서 ID를 고정값으로 하드코딩하지 않는다.
4. 인증 API는 반드시 `Authorization: Bearer {accessToken}` 헤더를 사용한다.
5. 날짜/시간은 ISO 8601 문자열 기준으로 처리한다.
6. GAP Score, 트렌드, 즐겨찾기, 메인 통계 API는 아직 구현되지 않았다.
7. `/external-api/*`는 외부 관광/상권 데이터를 서버와 DB에 적재하기 위한 내부용 API로, 사용자 앱에서 직접 호출하지 않는다.

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
| GET | `/categories` | X | 장소 카테고리 목록 조회 |
| GET | `/places` | X | 장소 목록 및 필터링 |
| GET | `/places/{id}` | X | 장소 상세 조회 |
| POST | `/visit-verifications` | O | 방문 인증 세션 생성 |
| GET | `/visit-verifications/{id}` | O | 방문 인증 세션 조회 |

---

## 10. 아직 미구현

- 메인 화면 통계
  - 이번 달 방문 횟수
  - 모은 재료 개수
  - 인증 완료 횟수
  - 만든 음식 개수
  - 방문 횟수 최다 지역 TOP3
- GAP Score 및 지역별/장소별 스팟 집계
- 즐겨찾기
- 장소 방문/미방문 여부
- 획득 가능한 재료 조회
- 현재 영업 여부 계산
- 방문 인증 완료 및 재료 지급
- 트렌드 요약
- AI 관심 포인트
- 네이버 블로그 링크
- 함께 검색하는 키워드
