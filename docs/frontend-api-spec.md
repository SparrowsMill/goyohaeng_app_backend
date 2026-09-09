# 고요행 사용자 앱 API 명세서 v1

> 최종 수정: 2026-09-10  
> 대상: Flutter 사용자 앱 ↔ NestJS 백엔드 연동  
> 범위: 현재 구현 완료된 사용자 앱 API만 포함  
> 제외: `/external-api/*` 데이터 적재용 API, GAP Score 관련 API, 기록/발자국 API

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

### 공통 주의사항

- 날짜/시간 응답은 ISO 8601 문자열 기준으로 처리한다.
- `regionId`, `categoryId`, `placeId`, `verificationId`, `foodId`는 프론트에서 임의의 고정값으로 하드코딩하지 않는다.
- `/external-api/*`는 외부 데이터를 서버/DB에 적재하기 위한 내부용 API이므로 사용자 앱에서 직접 호출하지 않는다.

---

## 2. Auth

> Auth / Users 데이터는 PostgreSQL에 저장된다.

### 2.1 아이디 중복 확인

```http
GET /auth/check-username?username={username}
```

| 이름 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `username` | string | O | 중복 확인할 아이디 |

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

---

## 3. Users

> 아래 API는 JWT 인증이 필요하다.

### 3.1 내 정보 조회

```http
GET /users/me
```

### 3.2 내 정보 수정

```http
PATCH /users/me
```

### 3.3 알림 설정 수정

```http
PATCH /users/me/settings
```

### 3.4 비밀번호 변경

```http
PATCH /users/me/password
```

### 3.5 회원탈퇴

```http
DELETE /users/me
```

### 3.6 메인 대시보드 조회

```http
GET /users/me/dashboard
```

Success `200` 예시:

```json
{
  "monthlyVisitCount": 8,
  "ingredientCount": 6,
  "verifiedVisitCount": 8,
  "madeFoodCount": 1,
  "topRegions": [
    {
      "regionId": 2,
      "regionName": "종로구",
      "visitCount": 6
    },
    {
      "regionId": 15,
      "regionName": "마포구",
      "visitCount": 2
    }
  ]
}
```

### 3.7 내 즐겨찾기 목록 조회

```http
GET /users/me/favorites?page=1&limit=20
```

Success `200` 예시:

```json
{
  "items": [
    {
      "id": 6859,
      "name": "두르가",
      "categoryId": 12,
      "districtRegionId": 2,
      "roadAddress": "서울특별시 ...",
      "latitude": 37.57,
      "longitude": 126.98,
      "imageUrl": null,
      "isFavorite": true,
      "favoritedAt": "2026-09-10T00:00:00.000Z"
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 1,
  "totalPages": 1
}
```

### 3.8 내 보유 재료 목록 조회

```http
GET /users/me/ingredients
```

Success `200` 예시:

```json
{
  "items": [
    {
      "id": 1,
      "name": "쌀",
      "description": null,
      "ingredientType": "BASIC",
      "quantity": 4,
      "imageUrl": null,
      "illustrationUrl": null,
      "rarity": null,
      "regionId": null,
      "firstAcquiredAt": "2026-09-09T10:00:00.000Z",
      "updatedAt": "2026-09-10T00:00:00.000Z"
    }
  ],
  "totalTypes": 1,
  "totalQuantity": 4
}
```

### 3.9 내가 만든 음식 목록 조회

```http
GET /users/me/foods?page=1&limit=20
```

Success `200` 예시:

```json
{
  "items": [
    {
      "id": 1,
      "foodId": 1,
      "name": "비빔밥",
      "description": "비빔밥 설명",
      "imageUrl": null,
      "illustrationUrl": null,
      "madeAt": "2026-09-10T00:00:00.000Z",
      "specialIngredient": null,
      "specialSourcePlace": null
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 1,
  "totalPages": 1
}
```

---

## 4. Regions

### 4.1 지역 목록 조회

```http
GET /regions
```

### 4.2 지역별 스팟 수 조회

```http
GET /regions/{regionId}/spot-counts
```

---

## 5. Categories

### 5.1 장소 카테고리 목록 조회

```http
GET /categories
```

---

## 6. Places

### 6.1 장소 목록 조회

```http
GET /places
```

Query:

| 이름 | 타입 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|
| `regionId` | number | X | - | 지역 ID |
| `categoryId` | number | X | - | 카테고리 ID |
| `page` | number | X | `1` | 페이지 번호 |
| `limit` | number | X | `20` | 페이지당 개수, 최대 100 |

> 장소 목록은 페이지네이션 객체를 반환하며 프론트에서는 `response.items`를 사용한다.

### 6.2 장소 상세 조회

> JWT 인증 필요

```http
GET /places/{id}
```

주요 응답 필드:

```json
{
  "id": 6859,
  "name": "장소명",
  "images": [],
  "operatingHours": [],
  "isOpenNow": false,
  "benefits": [],
  "availableIngredients": [],
  "verification": null,
  "isFavorite": true
}
```

`isFavorite`은 로그인한 사용자가 해당 장소를 즐겨찾기했는지 여부다.

### 6.3 장소 방문 여부 조회

> JWT 인증 필요

```http
GET /places/{placeId}/visit-status
```

```json
{
  "placeId": 6859,
  "visited": true
}
```

### 6.4 장소 트렌드 요약 조회

```http
GET /places/{id}/trends
```

Success `200` 예시:

```json
{
  "placeId": 6859,
  "placeName": "두르가",
  "summaryText": null,
  "keywords": [],
  "periodStart": null,
  "periodEnd": null,
  "generatedAt": null,
  "contents": [],
  "searchTerm": null,
  "searchInterest": []
}
```

> DB에 트렌드 데이터가 없으면 `null` 또는 빈 배열이 반환될 수 있다.  
> `함께 검색하는 키워드` 기능은 구현 대상에서 제외되었다.

### 6.5 트렌드 최초 조회 보상 지급

> JWT 인증 필요

```http
POST /places/{id}/trends/first-view
```

첫 지급:

```json
{
  "firstView": true,
  "rewarded": true,
  "ingredient": {
    "id": 1,
    "name": "쌀",
    "quantity": 1
  }
}
```

이미 지급된 경우:

```json
{
  "firstView": false,
  "rewarded": false,
  "ingredient": null
}
```

정책:

- 활성 `BASIC` 재료 중 랜덤 1종
- 수량 1개
- 사용자별·장소별 최초 1회
- `transactionType = TREND_FIRST_VIEW`

### 6.6 장소 즐겨찾기 추가

> JWT 인증 필요

```http
POST /places/{id}/favorite
```

```json
{
  "placeId": 6859,
  "isFavorite": true
}
```

### 6.7 장소 즐겨찾기 해제

> JWT 인증 필요

```http
DELETE /places/{id}/favorite
```

```json
{
  "placeId": 6859,
  "isFavorite": false
}
```

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
  "placeId": 6859,
  "arrivalOptionMinutes": 30
}
```

`arrivalOptionMinutes`: `10`, `30`, `60`

### 7.2 방문 인증 세션 조회

```http
GET /visit-verifications/{verificationId}
```

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

인증 성공 시:

- `VisitVerification.status`: `ISSUED → VERIFIED`
- 해당 장소의 활성 `EVERY_VISIT` 보상 지급
- `UserIngredient` 수량 증가
- `IngredientTransaction.transactionType = VISIT_REWARD`

현재 자동 지급되는 reward rule은 `EVERY_VISIT`이며 `FIRST_VERIFIED_VISIT`, `CAMPAIGN`은 아직 자동 처리하지 않는다.

---

## 8. Foods

> 아래 API는 JWT 인증이 필요하다.

### 8.1 음식 목록 조회

```http
GET /foods
```

사용자의 현재 보유 재료와 레시피 필요 수량을 비교해 `canMake`를 계산한다.

```json
{
  "items": [
    {
      "id": 1,
      "name": "비빔밥",
      "description": "비빔밥 설명",
      "regionId": 1,
      "regionName": "서울특별시",
      "imageUrl": null,
      "illustrationUrl": null,
      "canMake": false,
      "ingredients": [
        {
          "id": 1,
          "name": "쌀",
          "ingredientType": "BASIC",
          "requiredQuantity": 2,
          "ownedQuantity": 4,
          "enough": true,
          "imageUrl": null,
          "illustrationUrl": null,
          "rarity": null
        }
      ]
    }
  ]
}
```

### 8.2 음식 상세 조회

```http
GET /foods/{id}
```

음식 기본 정보, 레시피, 현재 보유량, `canMake`를 반환한다.

### 8.3 음식 만들기

```http
POST /foods/{id}/make
```

Request Body 없음.

Success `200` 예시:

```json
{
  "success": true,
  "userFood": {
    "id": 1,
    "foodId": 1,
    "name": "비빔밥",
    "madeAt": "2026-09-10T00:00:00.000Z",
    "illustrationUrl": null
  },
  "usedIngredients": [
    {
      "ingredientId": 1,
      "name": "쌀",
      "quantity": 2
    }
  ]
}
```

재료 부족 시 `400` 예시:

```json
{
  "statusCode": 400,
  "message": "보유한 재료가 부족합니다.",
  "missingIngredients": [
    {
      "ingredientId": 2,
      "name": "대파",
      "requiredQuantity": 1,
      "ownedQuantity": 0,
      "shortage": 1
    }
  ]
}
```

처리 내용:

1. 활성 음식 및 레시피 조회
2. 재료 보유량 검사
3. `UserFood` 생성
4. `UserIngredient.quantity` 차감
5. 재료별 `IngredientTransaction` 생성 (`transactionType = FOOD_USE`)
6. 전부 하나의 DB 트랜잭션으로 처리

---

## 9. 프론트 연동 시 주의사항

1. `Users`, `Regions`, `Categories`, `Places`, `Visit Verifications`, `Favorites`, `Ingredients`, `Foods`는 PostgreSQL 기반이다.
2. `/places`는 페이지네이션 응답이므로 장소 목록은 `response.items`에서 읽는다.
3. 장소 상세 `GET /places/{id}`는 JWT 인증이 필요하며 `isFavorite`을 반환한다.
4. 즐겨찾기 추가/해제는 `POST /places/{id}/favorite`, `DELETE /places/{id}/favorite`을 사용한다.
5. 장소 방문 여부는 `GET /places/{placeId}/visit-status`에서 확인한다.
6. 방문 인증 성공 시 현재는 `EVERY_VISIT` 보상만 자동 지급된다.
7. 트렌드 최초 조회 보상은 활성 `BASIC` 재료 중 랜덤 1개이며 사용자별·장소별 최초 1회만 지급된다.
8. 음식 목록/상세의 `canMake`, `ownedQuantity`, `enough`는 로그인 사용자의 현재 재료 보유량 기준이다.
9. 음식 만들기는 재료 차감, `UserFood` 생성, `FOOD_USE` 이력 생성을 하나의 DB 트랜잭션으로 처리한다.
10. 트렌드 데이터가 없는 장소는 `summaryText`, `searchTerm` 등이 `null`, 목록 필드는 빈 배열일 수 있다.
11. `함께 검색하는 키워드` 기능은 구현하지 않는다.
12. GAP Score, GAP 기반 관련 관광지 추천, 기록/발자국 API는 아직 구현되지 않았다.
13. `/external-api/*`는 데이터 적재용 내부 API로 사용자 앱에서 직접 호출하지 않는다.

---

## 10. 현재 구현 API 요약

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
| GET | `/users/me/dashboard` | O | 메인 대시보드 통계 |
| GET | `/users/me/favorites` | O | 내 즐겨찾기 목록 |
| GET | `/users/me/ingredients` | O | 내 보유 재료 목록 |
| GET | `/users/me/foods` | O | 내가 만든 음식 목록 |
| GET | `/regions` | X | 지역 목록 조회 |
| GET | `/regions/{regionId}/spot-counts` | X | 지역별 스팟 수 조회 |
| GET | `/categories` | X | 장소 카테고리 목록 조회 |
| GET | `/places` | X | 장소 목록 / 필터 / 페이지네이션 |
| GET | `/places/{id}` | O | 장소 상세 + 즐겨찾기 여부 |
| GET | `/places/{placeId}/visit-status` | O | 장소 방문 여부 |
| GET | `/places/{id}/trends` | X | 장소 트렌드 요약 |
| POST | `/places/{id}/trends/first-view` | O | 트렌드 최초 조회 보상 |
| POST | `/places/{id}/favorite` | O | 즐겨찾기 추가 |
| DELETE | `/places/{id}/favorite` | O | 즐겨찾기 해제 |
| POST | `/visit-verifications` | O | 방문 인증 세션 생성 |
| GET | `/visit-verifications/{verificationId}` | O | 방문 인증 세션 조회 |
| POST | `/visit-verifications/{verificationId}/verify` | O | 방문 인증 검증 + 재료 지급 |
| GET | `/foods` | O | 음식 목록 + 제작 가능 여부 |
| GET | `/foods/{id}` | O | 음식 상세 + 보유 재료 비교 |
| POST | `/foods/{id}/make` | O | 음식 만들기 + 재료 차감 |

---

## 11. 아직 미구현 / 추가 예정

### GAP / 추천

- 장소별 GAP Score 조회
- 지역별 GAP Score 조회
- 지도/랭킹 GAP 연동
- 방문 불가 페이지의 `함께 찾은 관광지`
  - 같은 지역
  - 같은 카테고리
  - 현재 장소 제외
  - 비슷한 GAP Score 순으로 추천

### 기록 / 발자국

- 프론트 최종 화면 확인 후 API 범위 확정
- 사진 + 텍스트 기록 작성
- 방문 장소 연결
- 기록 목록 / 상세 / 수정 / 삭제

### 방문 보상 추가 정책

현재 아래 reward rule은 자동 지급 로직 미적용:

```text
FIRST_VERIFIED_VISIT
CAMPAIGN
```

### 트렌드 데이터

트렌드 API 구조는 구현 완료. 실제 `PlaceTrendSnapshot`, `PlaceExternalContent`, 네이버 검색 관심도 데이터 적재 후 최종 데이터 검증 필요.

---

## 12. 현재 완료 상태

```text
Auth / Users PostgreSQL 연동                    완료
Regions / Categories PostgreSQL 연동            완료
Places PostgreSQL 연동                          완료
장소 목록 페이지네이션                          완료
장소 상세 / 이미지 / 영업시간 / 혜택             완료
현재 영업 여부(isOpenNow) 계산                   완료
장소 상세 즐겨찾기 여부(isFavorite)              완료
지역별 spot count                               완료

방문 인증 생성 / 조회 DB 저장                    완료
방문 인증 코드 검증 및 VERIFIED 처리              완료
인증 성공 후 EVERY_VISIT 재료 지급                완료
재료 보유량 증가 / 지급 이력 저장                 완료
장소 방문 여부 조회                              완료

메인 대시보드 통계                               완료
즐겨찾기 추가 / 해제 / 목록                       완료
보유 재료 목록                                   완료

장소 트렌드 요약 조회                            완료
트렌드 최초 조회 BASIC 랜덤 보상                 완료

음식 목록 / 상세                                 완료
보유 재료 기반 canMake 계산                      완료
음식 만들기                                      완료
재료 차감 및 FOOD_USE 이력 저장                  완료
내가 만든 음식 목록                              완료

GAP Score                                        미구현
GAP 기반 관련 관광지 추천                        미구현
기록 / 발자국                                    프론트 확인 후 구현 예정
```
