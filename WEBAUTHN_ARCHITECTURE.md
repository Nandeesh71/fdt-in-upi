# WebAuthn Architecture Diagrams & Flows

## System Architecture Diagram

```
┌─────────────────────────────────────┐
│      Frontend (React PWA)           │
│  https://fdt-frontend.onrender.com  │
│                                     │
│  ┌───────────────────────────────┐  │
│  │  App.js                       │  │
│  │  - JWT validation on load     │  │
│  │  - Route auth checks          │  │
│  │  - Biometric prompt control   │  │
│  └───────────────────────────────┘  │
│           │        │                 │
│           ▼        ▼                 │
│  ┌──────────────────────────────┐  │
│  │ api.js                       │  │
│  │ - validateToken()            │  │
│  │ - loginUser()                │  │
│  │ - logoutUser()               │  │
│  │ - Token management           │  │
│  └──────────────────────────────┘  │
│           │                         │
│           ▼                         │
│  ┌──────────────────────────────┐  │
│  │ utils/webauthn.js            │  │
│  │ - registerBiometric()        │  │
│  │ - authenticateWithBiometric()│  │
│  │ - Base64url encoding         │  │
│  └──────────────────────────────┘  │
│           │                         │
│           ▼                         │
│  ┌──────────────────────────────┐  │
│  │ components/                  │  │
│  │ - BiometricPrompt            │  │
│  │ - BiometricSetup             │  │
│  │ - LoginScreen                │  │
│  └──────────────────────────────┘  │
└─────────────────────────────────────┘
           │
           │  HTTPS
           │
           ▼
┌─────────────────────────────────────┐
│  Backend (FastAPI + Uvicorn)        │
│  https://fdt-admin-backend.onrender │
│                                     │
│  ┌───────────────────────────────┐  │
│  │  server.py                    │  │
│  │  - /auth/validate             │  │
│  │  - /auth/biometric/* routes   │  │
│  │  - JWT verification           │  │
│  │  - CORS configuration         │  │
│  └───────────────────────────────┘  │
│           │                         │
│           ▼                         │
│  ┌───────────────────────────────┐  │
│  │  webauthn_auth.py             │  │
│  │  - Challenge generation       │  │
│  │  - Attestation verification   │  │
│  │  - Assertion verification     │  │
│  │  - Base64url decoding         │  │
│  └───────────────────────────────┘  │
│           │                         │
│           ▼                         │
│  ┌───────────────────────────────┐  │
│  │  python-webauthn library      │  │
│  │  - generate_registration_opts │  │
│  │  - verify_registration_respn  │  │
│  │  - generate_auth_opts         │  │
│  │  - verify_auth_respn          │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
        ▲      ▲
        │      │
    Redis  PostgreSQL
        │      │
        ▼      ▼
┌──────────────────────────────┐
│  Infrastructure               │
│  - redis://...  (challenges)  │
│  - PostgreSQL (credentials)   │
└──────────────────────────────┘
```

---

## Complete User Journey Flow

```
                    ┌─────────────────────────────────┐
                    │    USER OPENS APP               │
                    │  (Fresh install or tab resume)  │
                    └──────────────┬──────────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │   Check localStorage for:   │
                    │   - fdt_token              │
                    │   - fdt_user               │
                    │   - fdt_credentials        │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │   JWT exists?               │
                    └──┬──────────────────────┬───┘
                       │YES                   │NO
                       ▼                       ▼
        ┌──────────────────────────┐    ┌─────────────────────┐
        │  /auth/validate          │    │  Show Login Screen  │
        │  Check JWT validity      │    │  (user/password)    │
        │  & get exp time          │    └─────────────────────┘
        └──┬───────────────────┬───┘
           │Valid             │Expired/Invalid
           ▼                  ▼
    ┌────────────────┐   ┌──────────────┐
    │Check for       │   │Clear storage │
    │biometric creds │   │Show login    │
    └────┬────────┬──┘   └──────────────┘
         │YES    │NO
         ▼       ▼
    ┌─────┐ ┌──────────┐
    │Bio  │ │Dashboard │
    │Prom │ │(unlocked)│
    │pt   │ └──────────┘
    └────┬───┘
         │
         ▼
    ┌──────────────────────────────────┐
    │ Show Biometric Unlock Prompt     │
    │ - Display fingerprint icon       │
    │ - Message: "Use biometric"       │
    │ - Fallback button: "Password"    │
    └──┬──────────────┬────────────────┘
       │User agrees  │User cancels
       ▼             ▼
    ┌──────────────────────┐   ┌──────────────┐
    │1. GET /auth/biometric│   │Show password │
    │   /authenticate/opts │   │login option  │
    ├──────────────────────┤   └──────────────┘
    │2. navigator.           │
    │   credentials.get()    │
    │   (Device biometric)   │
    │3. POST /auth/biometric│
    │   /authenticate/verify│
    └────────┬─────────────┘
             │
        ┌────┴──────┬──────────┐
        │Verified   │Failed    │
        ▼           ▼          ▼
    ┌────────┐  ┌──────────┐
    │Update  │  │Show error│
    │sign    │  │retry or  │
    │count   │  │password  │
    └────┬───┘  └──────────┘
         │
         ▼
    ┌──────────────────┐
    │UNLOCK DASHBOARD  │
    │✓ App fully open  │
    │✓ Ready to use    │
    └──────────────────┘
```

---

## Login with Biometric Registration

```
┌─────────────────────────┐
│  PASSWORD LOGIN SCREEN  │
│  [Phone] [Password]     │
└──────────┬──────────────┘
           ▼
    ┌──────────────────┐
    │POST /api/login   │
    │(phone+password)  │
    └────┬─────────────┘
         │
    ┌────▼──────────────────┐
    │Valid credentials?      │
    └────┬─────────┬────────┘
         │YES      │NO
         ▼         ▼
    ┌──────────┐  ┌──────────┐
    │Return    │  │ 401      │
    │JWT+User  │  │ Error    │
    └────┬─────┘  └──────────┘
         │
    ┌────▼──────────────────────────┐
    │Store in sessionStorage:        │
    │ - fdt_token = JWT              │
    │ - fdt_user = {user data}       │
    └────┬──────────────────────────┘
         │
    ┌────▼──────────────────────────┐
    │Offer Biometric Registration?   │
    │ [Enable] [Skip for now]        │
    └─┬──────────────┬──────────────┘
      │Enable       │Skip
      ▼             ▼
    ┌───────────────────────┐   ┌──────────────┐
    │1. POST /auth/biometric│   │Show Dashboard│
    │  /register/options    │   │(no biometric)│
    │  (with JWT)           │   └──────────────┘
    ├───────────────────────┤
    │2. navigator.credentials
    │   .create()           │
    │   (Device registers)  │
    │3. POST /auth/biometric│
    │  /register/verify     │
    └────────┬──────────────┘
             │
        ┌────▼──────────────┐
        │Success?            │
        └────┬────────┬──────┘
             │YES    │Error
             ▼       ▼
        ┌────────┐  ┌──────────┐
        │Store   │  │ Retry or │
        │to DB:  │  │ skip     │
        │- cred  │  │          │
        │- pubkey│  └──────────┘
        │- count │
        └────┬───┘
             │
             ▼
        ┌──────────────────────────┐
        │ Store in sessionStorage: │
        │ fdt_credentials = [{...}]│
        └────┬─────────────────────┘
             │
             ▼
        ┌──────────────┐
        │Dashboard Open│
        │✓ Ready       │
        │✓ Biometric   │
        │  registered  │
        └──────────────┘
```

---

## Token Validation Sequence

```
Browser                API Backend           Database
  │                         │                    │
  │◄──── sessionStorage ─────┤                    │
  │   (fdt_token)            │                    │
  │                          │                    │
  │  GET /auth/validate      │                    │
  ├──────────────────────────►                    │
  │Authorization: Bearer JWT │                    │
  │                          │                    │
  │                    ┌─────▼─────┐             │
  │                    │decode JWT  │             │
  │                    │check sig   │             │
  │                    │check exp   │             │
  │                    └────┬────┬──┘             │
  │                         │    │                │
  │                    Valid│    │Invalid/Expired
  │                         ▼    ▼                │
  │  ┌─────────────────────┐  ┌────────────────┐
  │  │{status:"valid",...} │  │{"detail":"..."}│
  │  │HTTP 200             │  │HTTP 401        │
  │  └────┬────────────────┘  └────┬───────────┘
  │       │                        │
  │   ◄───┴────────────────────────┤
  │                                │
  │  Parse response                │
  │       │                        │
  │   ┌───▼───┐             ┌──────▼──┐
  │   │Valid? │             │Invalid? │
  │   └─┬─┬───┘             └──┬──┬───┘
  │     │ │                    │  │
  │   Y │ │ N                Y │  │ N
  │     ▼ ▼                    ▼  ▼
  │   ┌─────────┐        ┌──────────┐
  │   │Continue │        │Clear JWT │
  │   │app flow │        │Show login│
  │   └─────────┘        └──────────┘
```

---

## Biometric Unlock Sequence Diagram

```
Browser            API Backend         Python-WebAuthn       Device Biometric
  │                     │                    │                      │
  │ POST /auth/          │                    │                      │
  │  biometric/auth/opts│                    │                      │
  ├────────────────────►│                    │                      │
  │                     │                    │                      │
  │                     │  get_redis_client()                       │
  │                     │                    │                      │
  │                     │  generate_auth_challenge()                │
  │                     ├──────────────────►│                      │
  │                     │                    │                      │
  │                     │  Returns: challenge                       │
  │                     │◄──────────────────┤                      │
  │                     │                    │                      │
  │                     │  Store in Redis   │                      │
  │                     │  TTL=600s         │                      │
  │  {challenge:..., opts}                   │                      │
  │◄────────────────────┤                    │                      │
  │                     │                    │                      │
  │ Convert challenge   │                    │                      │
  │ navigator.credentials.get()              │                      │
  ├───────────────────────────────────────────────────────────────►│
  │                     │                    │                  Prompt │
  │                     │                    │                  for    │
  │                     │                    │                 biometric
  │                     │                    │                      │
  │                     │                    │                 User  │
  │                     │                    │            authenticates
  │                     │                    │                      │
  │◄───────────────────────────────────────────────────────────────┤
  │ assertion (id, signature, auth_data...)                         │
  │                     │                    │                      │
  │ POST /auth/         │                    │                      │
  │  biometric/auth/verify                   │                      │
  ├────────────────────►│                    │                      │
  │ {credential_id,     │                    │                      │
  │  authenticator_data,│                    │                      │
  │  signature}         │  retrieve_challenge()                     │
  │                     ├──────────────────►│                      │
  │                     │  Get from Redis   │                      │
  │                     │  Delete after use │                      │
  │                     │◄──────────────────┤                      │
  │                     │                    │                      │
  │                     │  verify_authentication()                  │
  │                     ├──────────────────►│                      │
  │                     │  - Decode assert  │                      │
  │                     │  - Verify sig     │                      │
  │                     │  - Check counter  │                      │
  │                     │  - Verify origin  │                      │
  │                     │  - Verify challenge                       │
  │                     │◄──────────────────┤                      │
  │                     │                    │                      │
  │                     │  Update counter   │                      │
  │                     │  in DB            │                      │
  │                     │  (Queries)        │                      │
  │                     │                    │                      │
  │ {status:"success",   │                    │                      │
  │  user_id:"..."}     │                    │                      │
  │◄────────────────────┤                    │                      │
  │                     │                    │                      │
  │ UNLOCK DASHBOARD    │                    │                      │
```

---

## Error Handling Flows

### Scenario 1: Expired Challenge
```
User tries biometric unlock
  ↓
Browser gets challenge options (received 5 mins ago)
  ↓
User attempts biometric (6 mins later)
  ↓
Challenge stored for 10 mins, now deleted from Redis
  ↓
Backend: retrieve_challenge() returns None
  ↓
Return: {"status": "failed", "error": "Invalid or expired challenge"}
  ↓
Frontend: Show error + "Try Again" button
  ↓
User clicks "Try Again"
  ↓
Get fresh challenge options (10 min TTL resets)
  ↓
Biometric succeeds with fresh challenge
```

### Scenario 2: Browser WebAuthn Not Supported
```
App startup
  ↓
isWebAuthnSupported() returns false
  ↓
BiometricPrompt renders: return null (doesn't show)
  ↓
Skip biometric flow entirely
  ↓
If JWT valid → Direct dashboard
  ↓
If JWT invalid → Password login only (no biometric option)
```

### Scenario 3: User Cancels Biometric
```
BiometricPrompt shows fingerprint icon
  ↓
User cancels (taps outside or presses cancel)
  ↓
navigator.credentials.get() returns null
  ↓
authenticateWithBiometric() catches error
  ↓
showBiometricPrompt = false
  ↓
User sees "Use Password Instead" button
  ↓
Click → Show password login form
  ↓
User enters password → Normal login flow
```

---

## Data Flow with Base64url Encoding

```
┌─ Device Local ──────────────────────────────────────────────────┐
│                                                                  │
│  Raw Credential Data (binary):                                  │
│  ├─ attestationObject: [0xFF, 0xAB, 0xCD, ...]                │
│  └─ clientDataJSON: [0x7B, 0x22, 0x74, 0x79, ...]             │
│                                                                  │
│  Navigator encodes:                                             │
│  ├─ bufferToBase64url(attestationObject)                       │
│  │  → "Y2hhbGxlbmdlXzEyMw=="                                   │
│  │  → (strip padding, replace +/): "Y2hhbGxlbmdlXzEyMw"       │
│  │                                                              │
│  └─ bufferToBase64url(clientDataJSON)                          │
│     → Encoded base64url string                                 │
│                                                                  │
└──────────────────────────────────────────────────────────────┬──┘
                          │ HTTPS POST
                          ▼
┌─> Network ──────────────────────────────────────────────────────┐
│                                                                  │
│  JSON payload sent:                                             │
│  {                                                              │
│    "credential_id": "Y2hhbGxlbmdl...",                          │
│    "attestation_object": "aGF0dGVz...",                         │
│    "client_data_json": "Y2xpZW50..."                            │
│  }                                                              │
│                                                                  │
└──────────────────────────────────────────────────────────────┬──┘
                          │
                          ▼
┌─ Server ────────────────────────────────────────────────────────┐
│                                                                  │
│  Backend receives JSON:                                         │
│  ├─ Decode base64url → ArrayBuffer:                            │
│  │  base64urlToArrayBuffer(attestation_object)                 │
│  │    → [0xFF, 0xAB, 0xCD, ...]                               │
│  │                                                              │
│  └─ Pass binary data to python-webauthn:                       │
│     verify_registration(attestation_object=decoded_bytes)      │
│                                                                  │
│  python-webauthn library:                                       │
│  ├─ Parses CBOR attestation structure                          │
│  ├─ Extracts public key, counter, etc                          │
│  ├─ Verifies signature cryptographically                       │
│  └─ Returns success + credential data                          │
│                                                                  │
│  Store in database:                                             │
│  ├─ credential_id (base64url string)                           │
│  ├─ public_key (base64url string)  ← Stored for future auth    │
│  └─ counter (integer)  ← Used to detect replay attacks        │
│                                                                  │
└────────────────────────────────────────────────────────────────┘
```

---

## Challenge Lifecycle in Redis

```
Step 1: Challenge Generation
┌─────────────────────────────────┐
│ POST /auth/biometric/register/  │
│ options                         │
│ ├─ User: logged in (has JWT)   │
│ ├─ Action: About to register   │
│ └─ Method: Get registration    │
│           challenge              │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ Backend generates challenge:     │
│ - 32 random bytes                │
│ - Encode to base64url            │
│ - Return to frontend             │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ Store in Redis:                 │
│ KEY: webauthn_challenge:        │
│      user_123:registration      │
│ VALUE: {challenge: "...",       │
│         type: "registration",   │
│         timestamp: "2026-..."}  │
│ TTL: 600 seconds (10 mins)      │
└────────┬────────────────────────┘
         │
    ┌────┴──────────┬──────────┐
    │               │          │
    ▼               ▼          ▼
  Used            Expired    Never
                            Retrieved

Step 2: Challenge Used (Success Case)
┌─────────────────────────────────┐
│ POST /auth/biometric/register/   │
│ verify                          │
│ └─ Frontend sends attestation   │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ Backend: retrieve_challenge()   │
│ - Look up in Redis              │
│ - Found! Challenge exists       │
│ - Verify challenge matches      │
│   attestation signature         │
│ - DELETE key from Redis         │
│   (one-time use)                │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ Verification success:           │
│ - Challenge deleted from Redis  │
│ - Cannot be reused              │
│ - Cannot be used again in 10min │
│ - Cannot be stored elsewhere    │
└─────────────────────────────────┘

Step 3: Challenge Expired (Time Case)
┌─────────────────────────────────┐
│ ~10 minutes pass...             │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ User finally submits assertion  │
│ POST /auth/biometric/register/  │
│ verify                          │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ Backend: retrieve_challenge()   │
│ - Look up in Redis              │
│ - KEY NOT FOUND                 │
│   (TTL expired)                 │
│ - Returns: None                 │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ Error response:                 │
│ HTTP 400                        │
│ {"error":"Invalid or expired    │
│           challenge"}           │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ Frontend shows error:           │
│ "Challenge expired, try again"  │
│ [Retry] button                  │
│                                 │
│ User clicks [Retry]             │
│ └─ Back to Step 1               │
│    (Fresh 10-min challenge)     │
└─────────────────────────────────┘
```

---

Version 1.0 | February 18, 2026 | Production Ready
