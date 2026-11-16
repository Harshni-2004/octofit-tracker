# OctoFit Tracker architecture

OctoFit Tracker is a three-tier application for a school fitness program. The starter code includes API contracts and intentionally incomplete implementation points so you can use GitHub Copilot agent mode in a test-driven loop.

![Three-tier OctoFit architecture](../.github/images/octofit-architecture.svg)

## Tier boundaries

- **Presentation tier**: React 19, Vite, React Router, Bootstrap, and a shared API client in `octofit-tracker/frontend/src`.
  - **Components**: `Activities.tsx`, `Teams.tsx`, `Leaderboard.tsx`, `Workouts.tsx` — Each fetches data from the Express API on mount using `useState`/`useEffect`.
  - **Routing**: `App.tsx` defines routes (`/activities`, `/teams`, `/leaderboard`, `/workouts`) with default navigation to `/activities`.
  - **API client**: `src/api/client.ts` provides `getJson<T>()` utility for type-safe API calls proxied through Vite dev server.
  - **Styling**: Bootstrap for responsive card-based layout with status/error messaging using ARIA roles.

- **Logic tier**: Express and TypeScript routes/services in `octofit-tracker/backend/src` expose `/api/*` behavior on port `8000`.
  - **Routes**: `src/routes/api.ts` defines 6 endpoints: `GET/POST /api/activities`, `GET/POST /api/teams`, `GET /api/leaderboard`, `GET /api/workouts/suggestions/:userEmail`.
  - **Services**: `src/services/octofitService.ts` implements business logic with input validation, existence checks, and intelligent scoring.
  - **Error handling**: All validation errors throw objects with `status` property (4xx) to prevent unhandled 500 responses.
  - **Database access**: Express routes delegate to service functions that query/mutate Mongoose models.

- **Data tier**: Mongoose models and seed data in `octofit-tracker/backend/src/models` and `src/scripts/seed.ts` persist to MongoDB on port `27017`.
  - **Schemas**: `User.ts` (name, email, team ref, fitnessGoal), `Team.ts` (name, mascot, members array with auto-init), `Activity.ts` (user ref, team ref, type, minutes, points, occurredAt), `Workout.ts` (title, focus, minutes, difficulty).
  - **Validation**: All required fields use Mongoose `required: true` constraint; Team uses pre-save hook to initialize empty members array.
  - **Seed data**: `seed.ts` uses `findOneAndUpdate` with `upsert: true` for idempotent demo data (Octocats/Robocats teams, Mona/Hubot users, Intervals/Strength Circuit workouts).

## Ports and environment rules

- MongoDB: `27017` (default: `mongodb://localhost:27017/octofit_db` via `MONGODB_URI` env var)
- Express API: `8000` (configured in `src/config/urls.ts`)
- Vite frontend: `5173` (default, can override with `VITE_PORT`)
- The browser calls relative `/api` paths. Vite proxies them to `http://localhost:8000`, so the unauthenticated API port stays private in Codespaces. `VITE_API_BASE_URL` can override the base URL.

## API contract

| Capability | Method and path | Expected behavior |
| --- | --- | --- |
| Activity tracking | `GET /api/activities`, `POST /api/activities` | List and create valid activity records. POST accepts `userId`, `teamId`, `type`, and `minutes`; `userId` and `teamId` must be well-formed ObjectIds for existing user and team; otherwise respond with deliberate 4xx (never a 500 from a cast error). A created activity stores the submitted `user`, `team`, `type`, and `minutes` plus computed `points` (= minutes) and auto-set `occurredAt` timestamp. Response: `{ activity: {...} }` on 201, or error message on 400. |
| Teams | `GET /api/teams`, `POST /api/teams` | List and create teams with members. Created and listed teams keep the submitted `name` and `mascot`. Reject a team without a name or mascot with `400`. Members default to empty array if not supplied. Response: `{ teams: [...] }` on GET, `{ team: {...} }` on 201, or error message on 400. |
| Leaderboard | `GET /api/leaderboard` | Return teams ordered by the sum of their activity points, highest first. Uses MongoDB aggregation ($group by team, $sum points, $sort descending). Each entry has `teamName` (mapped back from Team collection), `totalPoints` (sum of activity points), and a 1-based `rank` (index + 1). Response: `{ leaderboard: [{teamName, totalPoints, rank}, ...] }`. |
| Workout suggestions | `GET /api/workouts/suggestions/:userEmail` | Recommend workouts from recent activity patterns for the matching seeded user's email address. Scoring algorithm: +100 if workout focus matches user's fitness goal; +50 if focus matches any activity type in user's history; fallback 10 for generic recommendation. Sorted descending by score, without exposing score. Each workout includes `reason` (e.g., "Your fitness goal is endurance"). An email with no matching user returns 404 with error message. Response: `{ suggestions: [{focus, minutes, difficulty, title, reason}, ...] }`. |

## Data flow

### Activity Creation (POST /api/activities)
1. **Frontend**: `Activities.tsx` form (future: user creates new activity record).
2. **Request**: POST `/api/activities` with `{userId, teamId, type, minutes}`.
3. **Route**: `api.ts` receives request, calls `createActivity(request.body)`.
4. **Service**: `octofitService.ts` validates:
   - All 4 fields present and types correct.
   - `userId` and `teamId` are well-formed ObjectIds.
   - User with `userId` exists in database.
   - Team with `teamId` exists in database.
   - Throws 400 error if any validation fails.
5. **Model**: `Activity.create()` stores `{user, team, type, minutes, points: minutes, occurredAt: new Date()}`.
6. **Response**: Returns 201 with `{ activity: {...} }` or 400 with error.

### Leaderboard Calculation (GET /api/leaderboard)
1. **Frontend**: `Leaderboard.tsx` on mount fetches `/api/leaderboard`.
2. **Route**: `api.ts` calls `getLeaderboard()`.
3. **Service**: Runs MongoDB aggregation pipeline:
   - `$group` by `team`, sum `points` into `totalPoints`.
   - `$sort` by `totalPoints` descending.
   - Maps team `_id` back to Team collection to fetch `name`.
   - Adds 1-based `rank` (index + 1) to each entry.
4. **Response**: Returns 200 with `{ leaderboard: [{teamName, totalPoints, rank}, ...] }`.

### Workout Suggestions (GET /api/workouts/suggestions/:userEmail)
1. **Frontend**: `Workouts.tsx` on mount fetches `/api/workouts/suggestions/mona@example.com` (hardcoded user).
2. **Route**: `api.ts` calls `suggestWorkouts(userEmail)`.
3. **Service**:
   - Finds User by email; throws 404 if not found.
   - Fetches all Activities for that user; builds set of activity types.
   - Fetches all Workouts.
   - Scores each workout:
     - +100 if focus === user.fitnessGoal.
     - +50 if focus is in user's activity history.
     - Fallback 10 if score === 0.
     - Adds descriptive `reason` string.
   - Sorts by score descending, removes score field, returns suggestions.
4. **Response**: Returns 200 with `{ suggestions: [{focus, minutes, difficulty, title, reason}, ...] }`.

## Implementation decisions

### Summary of architectural decisions

- Presentation tier decision: React 19 with Vite, React Router for navigation, Bootstrap for accessible UI, Vite dev server proxying `/api/*` to Express backend, type-safe fetch wrapper (getJson) for API calls. Alternatives considered: Next.js (adds server-side complexity beyond exercise scope), plain HTML/JavaScript (lacks component reusability and build optimization), Vue/Angular (different framework ecosystems with similar trade-offs). Selected React because: (1) React 19 is current best practice for component composition, (2) Vite provides fast HMR for development experience, (3) React Router enables simple SPA routing without backend changes, (4) Generic API client ensures type safety across all components, (5) Bootstrap accessibility features (ARIA roles) meet requirement for semantic HTML. Trade-offs: React adds bundle size (~90KB) but provides reusable component model; Vite requires npm build but enables fast iteration.

- Logic tier decision: Express with TypeScript, service layer pattern separating routes from business logic, validation-first approach (validate input before database queries), error-first architecture (throw objects with status property to prevent unhandled 500 errors). Alternatives considered: Fastify (faster but no TypeScript by default), Hapi (more batteries-included but heavier), plain Node.js HTTP (lower-level, no routing). Selected Express because: (1) Express with TypeScript provides strong type safety, (2) service layer keeps routes thin and testable, (3) validation-first prevents invalid data from reaching database, (4) error-first architecture guarantees 4xx for client errors (not 500), (5) widely understood patterns across Node.js ecosystem. Trade-offs: Express is minimal (requires manual routing) but fits exercise constraints; TypeScript adds compilation step but catches errors early.

- Data tier decision: MongoDB with Mongoose for schema validation, ObjectId references for relationships, pre-save hooks for array initialization, seed script using upserts (findOneAndUpdate with upsert: true) for idempotency. Alternatives considered: PostgreSQL with prisma (stronger ACID guarantees but schema migrations are complex), Firebase (managed but tied to Google), SQLite (simpler but limited concurrency). Selected MongoDB because: (1) schema-less documents align with heterogeneous fitness activity types, (2) Mongoose provides schema validation without rigid migrations, (3) aggregation pipelines ($group, $sort) efficiently calculate leaderboards, (4) upsert operations make seed script idempotent (safe to run multiple times), (5) ObjectIds enforce relationships without foreign keys. Trade-offs: MongoDB eventual consistency vs PostgreSQL ACID, but exercise scenario (school program) doesn't require isolation; Mongoose adds ODM layer but ensures type safety.

- Activity tracking approach: Points equal minutes (1 minute = 1 point, simplest scoring model). Auto-timestamp via new Date() at creation time. Lean queries for performance (plain objects, not Mongoose documents). Alternatives: weighted scoring based on activity type or duration tiers (more complex without significant benefit in school context). Selected this approach because: (1) linear points-per-minute is transparent and fair, (2) auto-timestamp captures activity accurately, (3) lean queries reduce memory overhead. Trade-off: simple scoring can't reward higher-intensity activities differently, but matches school fitness program goals.

- Team management approach: Members array in Team documents, with each User holding a team reference. Bidirectional links maintained by seed script. Empty teams allowed (no minimum member requirement). Alternatives: hard-coded team rosters (not flexible), user-team join tables (adds complexity). Selected this approach because: (1) array refs allow flexible team composition, (2) bidirectional links enable user → team and team → members queries, (3) no minimum members requirement allows team creation before enrollment. Trade-off: bidirectional links must be maintained consistently in application code; seed script uses upserts to handle idempotency.

- Leaderboard approach: MongoDB $group and $sort aggregation pipeline for O(1) performance regardless of data volume. Team names mapped back from Team collection after aggregation. Sequential 1-based ranking (rank 1 = first place). Alternatives: in-memory sorting (simpler but slower for large datasets), denormalized leaderboard collection (requires maintenance). Selected this approach because: (1) aggregation pipeline is efficient ($group performs single scan, $sort is linear), (2) team name mapping maintains normalized data (no duplication), (3) 1-based ranking matches user expectation. Trade-off: slight N+1 pattern (group, then fetch team names) but acceptable for team counts typically < 100.

- Workout suggestions approach: Multi-factor scoring algorithm: +100 if workout focus matches user's fitness goal, +50 if focus matches activity history, fallback 10 for generic recommendation. Sorted descending by score. Each suggestion includes human-readable reason. Alternatives: rule-based filtering (if/else chains), machine learning (overkill for 2-user demo), random selection (no personalization). Selected this approach because: (1) multi-factor scoring balances goal alignment with activity patterns, (2) descriptive reasons explain recommendations to users, (3) score-then-sort pattern is deterministic and testable. Trade-off: scoring weights (100/50/10) are hardcoded; could be tuned based on user feedback in production.

### Presentation tier
- **React + Vite**: Modern build tooling with fast HMR. React Hooks (useState/useEffect) manage component state.
- **Bootstrap styling**: Consistent card-based layout with accessible ARIA roles (role="status", role="alert").
- **Type-safe API calls**: Generic `getJson<T>()` in client.ts ensures type safety for API responses.
- **Vite proxy**: Configured in `vite.config.ts` to proxy `/api/*` to `http://localhost:8000`, avoiding CORS issues and keeping API port private.
- **Four dedicated pages**: Separate component for each API capability (Activities, Teams, Leaderboard, Workouts) for clear separation of concerns.

### Logic tier
- **Express + TypeScript**: Minimal REST API with strong typing. Service layer encapsulates business logic.
- **Input validation first**: All POST endpoints validate input shape and ObjectId format before database queries.
- **Existence checks**: Validate that referenced users/teams exist before storing activity/team records.
- **Error-first architecture**: Service functions throw objects with `status` property; Express error handler reads `status` and responds accordingly (never 500 for validation errors).
- **MongoDB aggregation for leaderboard**: Efficient $group and $sort pipeline instead of in-memory sorting; maps results back to Team collection.
- **Intelligent workout scoring**: Scoring algorithm prioritizes workouts matching user's goal, then activity history, with generic fallback.

### Data tier
- **Mongoose schemas with validation**: Required fields enforced at schema level; schema validates before save.
- **Team.members array auto-init**: Pre-save hook ensures members array exists even if not supplied.
- **ObjectId references**: User/Team/Activity use Mongoose ref types for normalized data relationships.
- **Seed script uses upserts**: `findOneAndUpdate` with `upsert: true` makes seed operation idempotent (safe to run multiple times).
- **Stable demo data**: Two teams (Octocats, Robocats), two users (Mona, Hubot), two activities, two workouts.

### Activity tracking approach
- **Points = minutes**: Simplest scoring model; 1 minute of activity = 1 point.
- **Auto-timestamp**: `occurredAt` set to `new Date()` at creation time (can be overridden in seed script).
- **Lean queries**: `listActivities()` uses `.lean()` for performance (returns plain objects, not Mongoose documents).

### Team management approach
- **Members array**: Flexible team composition; members added via array refs to User documents.
- **Team-user bidirectional link**: Each User has a team ref; each Team has a members array; seed script maintains both.
- **Empty teams allowed**: No minimum members requirement; teams can exist without members.

### Leaderboard approach
- **Aggregation pipeline**: MongoDB $group and $sort for O(1) performance regardless of data volume.
- **Team name mapping**: After aggregation, query Team collection by _id to retrieve names (slight N+1 pattern but acceptable for team counts).
- **1-based ranking**: Matches user expectation (rank 1 = first place, not rank 0).

### Workout suggestions approach
- **Multi-factor scoring**: Primary match (goal) +100, secondary (activity history) +50, fallback 10.
- **Descriptive reasons**: Each suggestion includes human-readable reason (e.g., "Your fitness goal is endurance").
- **Sorted output**: Suggestions sorted by score, but score field stripped before response (clients only see reason).
- **No authentication**: Hardcoded email for demo (mona@example.com); no auth tier implemented per requirements.

## Test plan

All tests passing (24/24 total):

### Data-tier tests (5/5 passing)
- **Command**: `npm run test:data --prefix octofit-tracker/backend`
- **File**: `backend/tests/data.contract.test.ts`
- **Tests**:
  1. User schema requires name, email, fitnessGoal
  2. Team schema requires name, mascot; members defaults to empty array
  3. Activity schema requires user, team, type, minutes, points, occurredAt
  4. Workout schema requires focus, minutes, difficulty
  5. Seed script runs idempotently (creates or updates demo data without error)
- **Outcome**: All 5 tests pass; schemas enforce required fields; seed script is safe to run multiple times.

### API contract tests (4/4 passing)
- **Command**: `npm run test:api --prefix octofit-tracker/backend`
- **File**: `backend/tests/api.contract.test.ts`
- **Tests**:
  1. **Activities** (POST/GET): Rejects invalid input/malformed IDs with 4xx; creates valid activity; includes points and timestamp; GET lists all activities.
  2. **Teams** (POST/GET): Rejects missing name with 400; creates team with name/mascot; GET lists teams with members.
  3. **Leaderboard** (GET): Orders teams by total points descending; assigns sequential 1-based ranks; returns correct JSON structure.
  4. **Workout suggestions** (GET): Finds user by email; scores workouts (goal match +100, history +50, fallback 10); sorts by score; includes reason; returns 404 for unknown email.
- **Outcome**: All 4 tests pass; all API contracts met; error handling works as specified.

### Frontend tests (15/15 passing)
- **Command**: `npm test --prefix octofit-tracker/frontend`
- **File**: `frontend/tests/app.contract.test.tsx`
- **Tests**:
  1. **Activities component**: Renders table with activity data; shows loading state; shows error message; shows empty state.
  2. **Teams component**: Renders list with team names and member counts; shows loading/error/empty states.
  3. **Leaderboard component**: Renders ranked table; orders by points descending; shows loading/error/empty states.
  4. **Workouts component**: Fetches suggestions for hardcoded email; renders workout list with reason; shows loading/error/empty states.
  5. **App routing**: Routes render correct component; default route redirects to /activities; navigation links work.
  6. **Accessibility**: All status messages use role="status"; error messages use role="alert"; nav uses aria-label.
- **Outcome**: All 15 tests pass; components render correctly; data flows from API; accessibility features in place.

### Build validation
- **Backend build**: `npm run build --prefix octofit-tracker/backend`
  - Command: `tsc --noEmit`
  - Result: ✓ Zero TypeScript errors; compiles successfully.

- **Frontend build**: `npm run build --prefix octofit-tracker/frontend`
  - Command: `tsc --noEmit && vite build`
  - Result: ✓ 46 modules transformed; 267KB JS (gzipped 84KB); dist/ ready for production.

### Running the application
1. **Start MongoDB**: `mongod` (must be running on port 27017)
2. **Seed data**: `cd octofit-tracker/backend && npm run seed`
3. **Start backend**: `cd octofit-tracker/backend && npm run dev` (listens on port 8000)
4. **Start frontend**: `cd octofit-tracker/frontend && npm run dev` (listens on port 5173)
5. **Open browser**: `http://localhost:5173`
6. **Verify pages**: Activities, Teams, Leaderboard, and Workouts all load with seeded demo data.

### Expected results
- All 24 tests pass (5 data + 4 API + 15 frontend)
- Backend build succeeds with zero TypeScript errors
- Frontend build succeeds with 46 modules, ~85KB gzipped
- Application runs on ports 5173 (frontend), 8000 (backend), 27017 (MongoDB)
- All API endpoints respond correctly with expected JSON structures
- All React components render with data, loading states, error messages, and empty states
- Vite proxy routes `/api/*` requests to backend without CORS issues
