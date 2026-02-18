# 🔍 AgroTech Project — Full Audit Report

> **Generated:** Comprehensive audit of all frontend pages and backend routes  
> **Stack:** Next.js (frontend) + Express.js (backend) + Prisma/PostgreSQL  
> **Auth:** Better Auth (session-based, cookie auth)

---

## 📊 Executive Summary

| Category | Total Pages | ✅ Connected | ⚠️ Broken Connection | ❌ Mock Data Only |
|----------|-------------|-------------|----------------------|-------------------|
| **Farmer** | 7 | 7 | 0 | 0 |
| **Buyer** | 5 | 0 | 1 | 4 |
| **Expert** | 4 | 0 | 1 | 3 |
| **Admin** | 6 | 0 | 1 | 5 |
| **Auth** | 3 | 3 | 0 | 0 |
| **TOTAL** | **25** | **10** | **3** | **12** |

**Verdict:** Only **40%** of frontend pages are properly connected to the backend. **48%** use entirely hardcoded mock data. **12%** attempt API calls but are broken.

---

## 🌾 FARMER ROLE

### Frontend Pages

| Page | Status | API Calls | Notes |
|------|--------|-----------|-------|
| `farmer-dashboard/page.tsx` | ✅ Connected | `apiGet('/api/farmer/dashboard')`, `apiGet('/api/farmer/market')`, `apiGet('/api/farmer/weather/alerts')`, `apiGet('/api/farmer/crops/recent')` | Fully functional |
| `farmer-dashboard/produce/page.tsx` | ✅ Connected | `apiGet('/api/farmer/crops')`, `apiPost('/api/farmer/crops')`, `apiPut('/api/farmer/crops/:id')`, `apiDelete('/api/farmer/crops/:id')` | Full CRUD |
| `farmer-dashboard/market/page.tsx` | ✅ Connected | `apiGet('/api/farmer/market?crop=...&search=...')` | Search/filter working |
| `farmer-dashboard/weather/page.tsx` | ✅ Connected | `apiGet('/api/farmer/weather')`, `apiGet('/api/farmer/weather/forecast')`, `apiGet('/api/farmer/weather/alerts')` | Uses OpenWeatherMap API with mock fallback |
| `farmer-dashboard/settings/page.tsx` | ✅ Connected | `apiGet('/api/farmer/settings')`, `apiPut('/api/farmer/profile')`, `apiPut('/api/farmer/settings')`, `apiPatch('/api/farmer/settings/password')` | Full settings management |
| `farmer-dashboard/profile/page.tsx` | ✅ Connected | `apiGet('/api/farmer/profile')`, `apiPut('/api/farmer/profile')` | Load & save working |
| `farmer-dashboard/chat/page.tsx` | ✅ Connected | `apiGet('/api/me')`, `apiGet('/api/farmer/chat/conversations')`, `apiGet('/api/farmer/chat/messages/:id')`, `apiPost('/api/farmer/chat/messages/:id')` | Uses `apiGet`/`apiPost` properly |

### Backend Routes

| Route File | Endpoints | DB Queries | Status |
|-----------|-----------|------------|--------|
| `farmer/dashboard/route.ts` | `GET /` | ✅ Real Prisma queries (User, Produce, Order) | ✅ Real data |
| `farmer/crops/route.ts` | `GET /`, `GET /recent`, `POST /`, `PUT /:id`, `DELETE /:id`, `PATCH /:id/status`, `GET /statistics` | ✅ Full CRUD on Produce table | ✅ Real data (views/inquiries are mocked) |
| `farmer/market/route.ts` | `GET /` | ✅ Prisma query on MarketPrice table | ✅ Real data |
| `farmer/weather/route.ts` | `GET /`, `GET /forecast`, `GET /alerts` | ✅ User location lookup, OpenWeatherMap API calls | ⚠️ Real API with mock fallback |
| `farmer/settings/route.ts` | `GET /`, `PUT /`, `PATCH /password`, `DELETE /account` | ✅ Full Prisma CRUD (UserSettings, Account) | ✅ Real data |
| `farmer/profile/route.ts` | `GET /`, `PUT /` | ✅ User + FarmerProfile tables | ✅ Real data |
| `farmer/listings/route.ts` | `GET /` | ✅ Produce table query | ✅ Real data |
| `farmer/chat/route.ts` | `GET /conversations`, `GET /messages/:id`, `POST /messages/:id` | ✅ Conversation + Message tables | ✅ Real data |

**🟢 Farmer section is fully functional.** Minor note: `views` and `inquiries` fields in crops route are randomly generated (`Math.random()`).

---

## 🛒 BUYER ROLE

### Frontend Pages

| Page | Status | API Calls | Notes |
|------|--------|-----------|-------|
| `buyer-dashboard/page.tsx` | ❌ **ALL MOCK** | None | Hardcoded `stats`, `recentListings`, `nearbyFarmers`, `marketPrices`. No imports from `@/lib/api`. |
| `buyer-dashboard/browse/page.tsx` | ❌ **ALL MOCK** | None | Hardcoded array of 8 listings. Client-side filtering only. No API imports. |
| `buyer-dashboard/favorites/page.tsx` | ❌ **ALL MOCK** | None | Hardcoded array of 5 favorites. Remove is client-side only (splice). No API imports. |
| `buyer-dashboard/chat/page.tsx` | ❌ **ALL MOCK** | None | Hardcoded `negotiations` array and `messages` array. No API imports. |
| `buyer-dashboard/profile/page.tsx` | ⚠️ **BROKEN** | `fetch("/api/buyer/profile")` (raw) | Uses `fetch()` directly instead of `apiGet`. **Missing `credentials: "include"`** so auth cookies won't be sent. Has `// TODO: Replace with actual API call` comments. Will get 401 errors. |

### Backend Routes

| Route File | Endpoints | DB Queries | Status |
|-----------|-----------|------------|--------|
| `buyer/dashboard/route.ts` | `GET /` | ✅ Full Prisma queries (Order, Produce, Favorite, BuyerProfile, Review) | ✅ Real data (ready, but frontend doesn't call it) |
| `buyer/browse/route.ts` | `GET /`, `GET /:id` | ✅ Prisma queries with filters, pagination, reviews, similar products | ✅ Real data (ready, but frontend doesn't call it) |
| `buyer/favorites/route.ts` | `GET /`, `DELETE /:id`, `DELETE /`, `POST /bulk` | ✅ Full CRUD on Favorite table | ✅ Real data (ready, but frontend doesn't call it) |
| `buyer/profile/route.ts` | `GET /`, `PUT /` | ✅ User + BuyerProfile tables | ✅ Real data (frontend uses broken fetch) |

**🔴 Buyer section is critically broken.** Backend routes exist and are fully implemented with real DB queries, but **4 out of 5 frontend pages use hardcoded mock data** and don't call the API at all. The profile page attempts API calls but uses `fetch()` without credentials.

### What Needs Fixing (Buyer):
1. **`buyer-dashboard/page.tsx`** — Replace all mock data with `apiGet('/api/buyer/dashboard')`
2. **`buyer-dashboard/browse/page.tsx`** — Replace mock listings with `apiGet('/api/buyer/browse?search=...&category=...')`
3. **`buyer-dashboard/favorites/page.tsx`** — Replace mock favorites with `apiGet('/api/buyer/favorites')`, use `apiDelete` for removal
4. **`buyer-dashboard/chat/page.tsx`** — No backend chat routes for buyer exist yet. Need to create `buyer/chat/route.ts` and connect frontend
5. **`buyer-dashboard/profile/page.tsx`** — Replace `fetch()` with `apiGet`/`apiPut` from `@/lib/api`

---

## 🎓 EXPERT ROLE

### Frontend Pages

| Page | Status | API Calls | Notes |
|------|--------|-----------|-------|
| `expert-dashboard/page.tsx` | ❌ **ALL MOCK** | None | Hardcoded `stats`, `recentQuestions`, `upcomingSchedule`, `recentArticles`, `activeAlerts`. No API imports. |
| `expert-dashboard/articles/page.tsx` | ❌ **ALL MOCK** | None | Hardcoded `articles` array (5 items). Write dialog exists but publish button doesn't POST. No API imports. |
| `expert-dashboard/chat/page.tsx` | ❌ **ALL MOCK** | None | Hardcoded `consultations` and `messages` arrays. No API imports. |
| `expert-dashboard/profile/page.tsx` | ⚠️ **BROKEN** | `fetch("/api/expert/profile")` (raw) | Uses `fetch()` without `credentials: "include"`. Has `// TODO` comments. Will get 401 errors. |

### Backend Routes

| Route File | Endpoints | DB Queries | Status |
|-----------|-----------|------------|--------|
| `expert/dashboard/route.ts` | `GET /` | ✅ Prisma queries (ExpertProfile, Conversation, Article) | ✅ Real data (ready, but frontend doesn't call it) |
| `expert/articles/route.ts` | `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id` | ✅ Full CRUD on Article table | ✅ Real data (ready, but frontend doesn't call it) |
| `expert/profile/route.ts` | `GET /`, `PUT /` | ✅ User + ExpertProfile tables | ✅ Real data (frontend uses broken fetch) |

**🔴 Expert section is critically broken.** Same pattern as buyer: backend is ready but frontend pages use mock data.

### What Needs Fixing (Expert):
1. **`expert-dashboard/page.tsx`** — Replace mock data with `apiGet('/api/expert/dashboard')`
2. **`expert-dashboard/articles/page.tsx`** — Replace mock data with `apiGet('/api/expert/articles')`, add `apiPost`/`apiPut`/`apiDelete` for article CRUD
3. **`expert-dashboard/chat/page.tsx`** — No backend chat routes for expert exist. Need to create or reuse conversation routes
4. **`expert-dashboard/profile/page.tsx`** — Replace `fetch()` with `apiGet`/`apiPut` from `@/lib/api`

---

## 🛡️ ADMIN ROLE

### Frontend Pages

| Page | Status | API Calls | Notes |
|------|--------|-----------|-------|
| `admin-dashboard/page.tsx` | ❌ **ALL MOCK** | None | Hardcoded `platformStats`, `recentActivity`, `pendingApprovals`, `systemHealth`, `regionStats`. No API imports. |
| `admin-dashboard/users/page.tsx` | ❌ **ALL MOCK** | None | Hardcoded `users` array (8 items). Client-side filtering. Action buttons (Approve/Suspend/Delete) do nothing. No API imports. |
| `admin-dashboard/market/page.tsx` | ❌ **ALL MOCK** | None | Hardcoded `marketPrices` array (10 items). Edit just logs to console. Add/Import buttons do nothing. No API imports. |
| `admin-dashboard/analytics/page.tsx` | ❌ **ALL MOCK** | None | Hardcoded `overviewStats`, `userGrowthData`, `topCommodities`, `regionalData`, `transactionTrends`. No API imports. |
| `admin-dashboard/alerts/page.tsx` | ❌ **ALL MOCK** | None | Hardcoded `alerts` array (5 items). Create alert dialog exists but Send button just closes dialog. No API imports. |
| `admin-dashboard/profile/page.tsx` | ⚠️ **BROKEN** | `fetch("/api/admin/profile")` (raw) | Uses `fetch()` without `credentials: "include"`. Has `// TODO` comments. Will get 401 errors. |

### Backend Routes

| Route File | Endpoints | DB Queries | Status |
|-----------|-----------|------------|--------|
| `admin/analytics/route.ts` | `GET /`, `GET /dashboard` | ✅ Comprehensive Prisma queries (User, Produce, Order, Review, Article, etc.) | ✅ Real data |
| `admin/users/route.ts` | `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `PATCH /:id/status`, `DELETE /:id` | ✅ Full CRUD with role stats, filtering, pagination | ✅ Real data |
| `admin/market/route.ts` | `GET /`, `GET /:id`, `PATCH /:id/approve`, `PATCH /:id/flag` | ✅ Product management with categories & stats | ✅ Real data |
| `admin/alerts/route.ts` | `GET /`, `GET /:id`, `POST /`, `PATCH /:id/resolve`, `PATCH /:id/reopen` | ✅ Full alert CRUD with resolve/reopen | ✅ Real data |
| `admin/profile/route.ts` | `GET /`, `PUT /`, `PATCH /password` | ✅ Admin profile with system stats | ✅ Real data |

**🔴 Admin section is critically broken.** Backend has comprehensive, well-built routes with full Prisma queries, but **all 5 main frontend pages use hardcoded mock data**.

### What Needs Fixing (Admin):
1. **`admin-dashboard/page.tsx`** — Replace mock data with `apiGet('/api/admin/analytics/dashboard')` or a custom endpoint
2. **`admin-dashboard/users/page.tsx`** — Replace mock users with `apiGet('/api/admin/users')`, wire up Approve/Suspend/Delete to API
3. **`admin-dashboard/market/page.tsx`** — Replace mock prices with `apiGet('/api/admin/market')`, wire up edit/add/approve
4. **`admin-dashboard/analytics/page.tsx`** — Replace mock data with `apiGet('/api/admin/analytics')`
5. **`admin-dashboard/alerts/page.tsx`** — Replace mock alerts with `apiGet('/api/admin/alerts')`, wire up Create/End actions to API
6. **`admin-dashboard/profile/page.tsx`** — Replace `fetch()` with `apiGet`/`apiPut` from `@/lib/api`

---

## 🔐 AUTH

### Frontend Pages

| Page | Status | API Calls | Notes |
|------|--------|-----------|-------|
| `auth/login/page.tsx` | ✅ Connected | `authClient.signIn.email()`, `authClient.getSession()` | Uses Better Auth client. Redirects by role after login. |
| `auth/signup/page.tsx` | ✅ Connected | `authClient.signUp.email()` | Uses Better Auth client. Role selection (Farmer/Buyer/Expert). Redirects to verify-email. |
| `auth/verify-email/page.tsx` | ✅ Connected | `fetch('http://localhost:5000/api/auth-utils/resend-verification')` with `credentials: 'include'` | Resend works. Uses correct base URL + credentials. |

### Backend Routes

| Route File | Endpoints | DB Queries | Status |
|-----------|-----------|------------|--------|
| `auth-utils/route.ts` | `GET /verification-status`, `POST /resend-verification`, `GET /profile-completion`, `GET /session-info` | ✅ Prisma + Better Auth API | ✅ Real data |
| Better Auth handler | `POST /api/auth/*` (sign-in, sign-up, etc.) | Handled by Better Auth library | ✅ Working |

**🟢 Auth section is fully functional.**

---

## 🚨 Critical Issues Summary

### Issue 1: Profile Pages Use Raw `fetch()` (3 pages)
**Affected:** `buyer/profile`, `expert/profile`, `admin/profile`  
**Problem:** These pages use `fetch("/api/buyer/profile")` instead of `apiGet('/api/buyer/profile')`. This causes two problems:
1. Missing `credentials: "include"` — auth cookies won't be sent, resulting in 401 Unauthorized
2. Missing base URL — `fetch("/api/...")` goes to `localhost:3000` (Next.js) instead of `localhost:5000` (Express)

**Fix:** Replace all `fetch()` calls with `apiGet`/`apiPut` from `@/lib/api`.

### Issue 2: 12 Pages Use Hardcoded Mock Data
**Affected:** All buyer dashboard/browse/favorites/chat, all expert dashboard/articles/chat, all admin dashboard/users/market/analytics/alerts  
**Problem:** These pages have hardcoded JavaScript arrays/objects and no API calls whatsoever. The backend routes for most of these already exist and are fully functional.

**Fix:** Import `apiGet`/`apiPost`/`apiPut`/`apiDelete` from `@/lib/api` and replace mock data with real API calls using `useEffect` + `useState`.

### Issue 3: Missing Backend Chat Routes
**Affected:** `buyer-dashboard/chat/page.tsx`, `expert-dashboard/chat/page.tsx`  
**Problem:** Only `farmer/chat/route.ts` exists on the backend. There are no `buyer/chat/route.ts` or `expert/chat/route.ts` routes.

**Fix:** Create buyer and expert chat backend routes (similar to farmer chat), or create a shared conversation route accessible by all roles.

### Issue 4: Backend Schema Mismatch Warning
**Note:** The admin backend routes reference fields like `isActive`, `isVerified`, `password`, `profile`, `systemLog`, `alert`, `approvedAt`, `approvedBy`, `farmerProduce`, `buyerOrders`, `OrderItem`, etc. that may not exist in the current Prisma schema. The admin routes appear to be written for a different schema version. These routes **will fail** at runtime with Prisma errors.

### Issue 5: Minor — Mock Data in Backend
- `farmer/crops/route.ts`: `views` and `inquiries` are randomly generated: `Math.floor(Math.random() * 200) + 10`
- `farmer/dashboard/route.ts`: `growth.revenueGrowth` and `growth.ordersGrowth` use `Math.random()`
- `buyer/dashboard/route.ts`: `recentlyViewedCount` uses `Math.random()`

---

## 📋 Priority Fix Order

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| **P0** | Fix 3 profile pages (buyer/expert/admin) — replace `fetch()` with `apiGet`/`apiPut` | Low (30 min each) | Unblocks profile editing |
| **P1** | Connect buyer dashboard page to `/api/buyer/dashboard` | Medium (1-2 hrs) | Unblocks buyer experience |
| **P2** | Connect buyer browse page to `/api/buyer/browse` | Medium (1-2 hrs) | Core buyer functionality |
| **P3** | Connect buyer favorites page to `/api/buyer/favorites` | Low (1 hr) | Favorites feature |
| **P4** | Connect expert dashboard to `/api/expert/dashboard` | Medium (1-2 hrs) | Unblocks expert experience |
| **P5** | Connect expert articles to `/api/expert/articles` | Medium (2-3 hrs) | Article CRUD |
| **P6** | Connect admin dashboard to analytics API | Medium (1-2 hrs) | Admin visibility |
| **P7** | Connect admin users page to `/api/admin/users` | Medium (2-3 hrs) | User management |
| **P8** | Connect admin market page to `/api/admin/market` | Medium (2-3 hrs) | Market management |
| **P9** | Connect admin alerts page to `/api/admin/alerts` | Medium (1-2 hrs) | Alert management |
| **P10** | Connect admin analytics to `/api/admin/analytics` | Medium (1-2 hrs) | Full analytics |
| **P11** | Create buyer/expert chat backend routes & connect frontend | High (3-4 hrs) | Chat functionality |
| **P12** | Verify admin backend routes match Prisma schema | Medium (2 hrs) | Prevent runtime crashes |

---

## ✅ What's Working Well

1. **Farmer section is 100% connected** — All 7 pages use `apiGet`/`apiPost` correctly
2. **Auth flow is complete** — Login, signup, email verification all work with Better Auth
3. **Backend routes are well-structured** — Consistent patterns, proper middleware, Prisma queries
4. **API helper utilities are solid** — `apiGet`/`apiPost`/`apiPut`/`apiPatch`/`apiDelete` all handle credentials, errors, and base URL correctly
5. **Prisma schema is comprehensive** — 25+ models covering all features
6. **Weather integration is real** — OpenWeatherMap API with graceful fallback to mock data
