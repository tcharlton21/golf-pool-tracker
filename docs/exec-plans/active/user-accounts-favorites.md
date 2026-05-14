# User Accounts + Favorites

## Problem

Anyone visiting the site sees Trent's hardcoded picks under "My Picks". We need lightweight per-user accounts so other people can star their own players and (optionally) link to a Marshalek/Piper pool entrant.

## Approach

- **Auth**: hybrid `register-or-login` endpoint takes `{email, password, signup_code?}`. If user exists → bcrypt-verify password, return JWT. If not → require `signup_code == "pga2026"`, hash + create, return JWT.
- **Tokens**: HS256 JWT, 90-day expiry, `JWT_SECRET` env var. Stored client-side in `localStorage`. No refresh token, no server-side blacklist (overkill for friends-pool scope).
- **Favorites**: `(user_id, event_id, golfer_normalized_name)` rows. CRUD via `/users/me/favorites`.
- **Pool link**: `(user_id, event_id, pool_type, entrant_id)` row. Setting a link auto-creates favorites for that entrant's 5 picks (user can manually unstar afterward).
- **My Picks source**: union of explicit favorites + linked entrants' picks across both pools.

## Key decisions

- Email-only identity, no display name field. Show email prefix in header.
- Signup code gate prevents random sign-ups but doesn't authenticate.
- Auto-favoriting on pool link is one-shot (not a live mirror) so users can curate.
- Backend uses `passlib[bcrypt]` + `python-jose[cryptography]`; FastAPI `Depends(get_current_user)` for protected routes.
- Frontend uses React Context for auth state, `useSWR` for favorites with mutate-on-write.

## Slices (each independently shippable)

1. **Auth backbone**: User table, register-or-login, /auth/me, JWT middleware, signup-code gate. Verifiable via curl.
2. **Favorites CRUD**: table + 3 endpoints. Verifiable via curl.
3. **Pool link**: table + 2 endpoints + auto-favorite on link. Verifiable via curl.
4. **Frontend auth UI**: AuthProvider, LoginModal, header user menu (login/logout/email). Visible in browser.
5. **Star button + My Picks rewire**: ⭐ on each leaderboard row, `useFavorites` hook, replace `myPickNames` derivation. Visible in browser.
6. **Pool linker UI**: dropdown in user menu to pick a Marshalek/Piper entrant by name. Visible in browser.

## Definition of Done

- All endpoints return correct shapes for happy + auth-failure paths
- JWT verified across page reloads
- Logged-in user can: star/unstar a golfer, link to a pool entry (auto-favorites picks), unlink, log out
- Existing Trent functionality preserved (his account auto-created via signup with `trentcharlton21@gmail.com` linked to both pool entries)
- No regressions in pool standings calc — favorites are display-only overlay
- Type checking + linting clean

## Out of scope

- Email verification, password reset, OAuth
- Per-event favorites carry-over (each event starts blank)
- Admin/multi-user pool management
- Real-time sync between users
- Mobile app

## Progress log

- 2026-05-14: plan created, branch `feat/user-accounts-favorites`
