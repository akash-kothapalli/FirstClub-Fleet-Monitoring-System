# FirstClub FFMS – LED Fleet Tracking & Field Force Management System

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-Proprietary-blue.svg)]()
[![Production Ready](https://img.shields.io/badge/production-ready-emerald.svg)]()

FirstClub FFMS is an enterprise-grade **LED Van Fleet Monitoring & Field Force Management Platform** built for real-time telemetry ingestion, cellular dead-zone offline buffering, campaign corridor auditing, driver-wise actual GPS route distance calculation, automated geofence breach detection, role-based vendor access control, and 20-minute driver photo proof uploads.

---

## 📋 1. Project Overview

### What the Project Does
FirstClub FFMS tracks digital out-of-home (DOOH) LED campaign trucks operating across major Indian metropolitan corridors (Bengaluru, Mumbai, Delhi, Hyderabad). It processes live GPS telemetry pings, buffers offline dead-zone data via IndexedDB, calculates actual daily route distance (km) and operational duty hours, alerts on geofence deviations or excessive halts, and generates executive PDF audit reports for client billing proof.

### Key Features & Architecture
- **Driver-Wise Actual GPS Route Distance Calculation**: Calculates exact route distance travelled by each driver using Haversine formula across consecutive GPS coordinates. Includes a **15-meter minimum displacement filter** to eliminate stationary GPS jitter from billing numbers.
- **7-Day Driver Distance Roster & Historical Logging**: Interactive manager modal (`DriverDistanceModal.jsx`) displaying driver-wise distance summaries, shift duty windows, and historical 7-day logs for any selected date.
- **Combined Fleet Distance & Target Tracking**: Displays combined distance covered across all drivers today vs Fleet Target (e.g. `Total Distance Today: 186.4 km | Fleet Target: 270 km`).
- **Page Visibility Resume Catch-Up Pings**: Uses the Page Visibility API (`visibilitychange`) to fire an immediate catch-up ping when a driver unlocks their phone or returns to the app tab, closing background gaps instantly.
- **10-Minute Telemetry Heartbeat Loop & Teardown**: Automated 10-minute heartbeat loop paired with Screen WakeLock API (`navigator.wakeLock.request('screen')`). Includes clean `clearInterval` teardown on shift end to prevent double timers.
- **Terminal Shift Status (`Shift Completed`)**: Ending a shift updates vehicle status to `'Shift Completed'` across Command Center roster cards and PDF reports, writing an explicit final timestamped telemetry ping.
- **Real-Time Server-Sent Events (SSE)**: Low-latency SSE streaming (`/api/events`) for instant broadcast of vehicle movements, status updates, break toggling, photo uploads, and critical alerts without requiring page refreshes.
- **20-Min Multi-Photo Proof Upload**: Multi-select camera & gallery image upload with automated 20-minute countdown timer, microsecond high-entropy primary keys (`proof_${Date.now()}_...`), and auto-telemetry ping recording.
- **PDF Auto-Download & Standardized Filenames**: Automatic blob download in `ReportModal.jsx` with standardized filename format (`FirstClub_Audit_Report_<DriverName>_<Date>.html/.pdf`) and concise report header (`FirstClub Outdoor LED Campaign Report`).
- **Strict 10-Digit Indian Mobile Number Validation**: Enforces `/^(?:91)?[6-9]\d{9}$/` regex testing on both Primary and Secondary mobile numbers across frontend forms and backend API routes.
- **Precision-Gated Geocoding & Systemic Cache Purge**: Precision landmark check (`isPrecise`), 150m Haversine distance re-validation on cache hits, and automated systemic purge of legacy/coarse revenue village cache entries (`Badamanavarthekaval`).
- **Turso Cloud SQLite & Local Persistence**: Dual-database engine supporting Turso Cloud SQLite (`@libsql/client`) or embedded Node.js 24 SQLite (`node:sqlite`) with Write-Ahead Logging (WAL) mode.
- **IndexedDB Dead-Zone Offline Buffering**: Client-side queuing of telemetry pings in browser `IndexedDB` during cellular dead zones, with auto-flushing to `POST /api/telemetry/batch` when connectivity is restored.
- **Strict Role Isolation (RBAC)**: Role-based access control for Operations Managers (`ops_manager`), Vendor Managers (`vendor_manager`), and Drivers (`driver`).

---

## 🛠️ 2. Tech Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend Framework** | React 18 (Vite 6) | Component-driven UI with low-latency client rendering |
| **Styling** | Modern Vanilla CSS | Glassmorphism dark aesthetic with CSS custom properties |
| **Client Storage** | IndexedDB (`fleet_offline_db`) | Offline telemetry ping buffering during cellular dead zones |
| **Maps & Spatial** | Leaflet 1.9.4 & HTML5 Canvas | Interactive mapping, tile caching, dynamic heatmap density circles |
| **Backend Core** | Node.js 24 + Express 4 | REST API backend, static file serving, rate limiting, and security middleware |
| **Database** | Node SQLite (`node:sqlite`) / Turso Cloud SQLite | High-performance embedded SQLite or Turso Cloud database with WAL mode |
| **Real-Time Streaming** | Server-Sent Events (SSE) | Unidirectional event streaming (`/api/events`) with automatic client reconnection |
| **Authentication** | HMAC-SHA256 Signed JWT | Secure cookie & Bearer token authentication with session revocation |
| **PDF Generation** | HTML Canvas & PDFKit Pattern | Executive daily audit report generation engine with cryptographic HMAC audit signatures |
| **Build & Deploy** | Vite, Render, Docker, Docker Compose | Production multi-stage build, container orchestration |

---

## 📁 3. Project Structure

```
led-fleet-monitoring/
├── Dockerfile                  # Production Alpine Node multi-stage container definition
├── docker-compose.yml          # Container orchestration with data & upload volume persistence
├── index.html                  # Single Page Application HTML entry point
├── package.json                # Project dependencies, scripts, and engine specs
├── vite.config.js              # Vite server & API proxy configuration
├── data/                       # SQLite WAL database directory (persisted volume)
│   └── fleet.db
├── public/                     # Static assets (logos, icons, default images)
├── uploads/                    # Physical upload storage for campaign photo proofs
│   └── proofs/
├── server/                     # Backend Express server modules
│   ├── index.js                # Server entry point, middleware setup, SSE stream
│   ├── db.js                   # SQLite schema initialization, safe migrations, seeds
│   ├── alerts.js               # Automated alert evaluation rules (geofence, idle, speed)
│   ├── pdfBuilder.js           # Daily audit PDF report generator engine
│   ├── sse.js                  # Server-Sent Events broadcast manager
│   ├── middleware/
│   │   ├── auth.js             # JWT verification, session tracking, role-based guard
│   │   └── rateLimiter.js      # Rate limiting middleware for telemetry endpoints
│   ├── routes/
│   │   ├── auth.js             # Login, logout, profile update, driver roster routes
│   │   ├── vehicles.js         # Vehicle CRUD, settings persistence, driver assignment
│   │   ├── telemetry.js        # Live GPS ping ingestion, batch upload, photo proofs
│   │   ├── campaigns.js        # Campaign corridors and geofence definitions
│   │   └── reports.js          # Executive PDF audit reports & driver distance endpoints
│   └── utils/
│       └── geofenceCheck.js    # Landmark grid reverse geocoder & 2D CITY_ZONES
├── src/                        # Frontend React application
│   ├── App.jsx                 # Main layout, view router, authentication provider wrapper
│   ├── index.css               # Global glassmorphism design system & utility classes
│   ├── main.jsx                # React root mount
│   ├── components/
│   │   ├── AdminPanel.jsx      # Admin vehicle roster CRUD table & vendor assignment
│   │   ├── AlertsCenter.jsx    # Real-time alert list & breach resolution
│   │   ├── AuthPage.jsx        # Production login screen & driver registration form
│   │   ├── Dashboard.jsx       # Operations Manager Command Center
│   │   ├── DriverApp.jsx       # Mobile Driver interface & location/break controls
│   │   ├── DriverDistanceModal.jsx # Driver-wise distance roster & 7-day log modal
│   │   ├── FleetMap.jsx        # Leaflet map instance, dynamic markers, heatmap layer
│   │   ├── Header.jsx          # Header navigation bar, user profile, logout
│   │   ├── ReportModal.jsx     # Executive PDF audit report modal & auto-downloader
│   │   ├── RouteReplay.jsx     # Historical GPS breadcrumb route playback
│   │   └── StatsOverview.jsx   # High-level fleet KPIs (Total Distance, Active Vans, SLA)
│   ├── context/
│   │   ├── AuthContext.jsx     # Authentication state & user context
│   │   └── FleetContext.jsx    # Live vehicle state, SSE listener, alert state
│   └── services/
│       ├── api.js              # Fetch wrapper with auto token injection & error handling
│       ├── geolocation.js      # HTML5 navigator.geolocation & IndexedDB offline queue
│       └── socket.js           # Server-Sent Events (SSE) client stream subscriber
└── tests/                      # Automated unit & security test suites
    ├── alertRules.test.js      # Alert evaluation unit tests
    ├── auth.test.js           # JWT & password hashing tests
    ├── geocoding.test.js       # Reverse geocoding & precision cache tests
    ├── geofence.test.js        # Ray-casting point-in-polygon math tests
    ├── offlineSync.test.js     # Batch telemetry ingestion & offline queue tests
    ├── testRunner.js           # Test suite execution runner
    └── vendorScoping.test.js   # Vendor role scoping isolation security tests
```

---

## ⚙️ 4. Environment Variables

Configure environment variables in a `.env` file or within your deployment provider (e.g. Render):

| Variable | Required | Default | Description |
| :--- | :---: | :--- | :--- |
| `PORT` | Optional | `3000` | Express HTTP server port |
| `NODE_ENV` | Optional | `development` | Application environment (`development` or `production`) |
| `JWT_SECRET` | Recommended | `firstclub_...` | Secret key for signing HMAC-SHA256 authentication tokens |
| `DATA_DIR` | Optional | `./data` or `/var/data` | Directory path for SQLite database file persistence |
| `UPLOADS_DIR` | Optional | `./uploads/proofs` | Directory path for storing uploaded photo proof images |
| `TURSO_DATABASE_URL` | Optional | `undefined` | Turso Cloud SQLite database URL (e.g. `libsql://...`) |
| `TURSO_AUTH_TOKEN` | Optional | `undefined` | Turso Cloud SQLite authentication token |

---

## 🚀 5. Local Setup & Installation

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Run Automated Unit & Security Tests
```bash
npm test
```

### Step 3: Build Production Bundle
```bash
npm run build
```

### Step 4: Start Express Server
```bash
npm run server
```

The application will be accessible at `http://localhost:3000`.

---

## 🔐 6. Role-Based Access Control (RBAC) Matrix

| Privilege / Capability | Operations Manager (`ops_manager`) | Vendor Manager (`vendor_manager`) | Driver (`driver`) |
| :--- | :---: | :---: | :---: |
| **Fleet View Scope** | All nationwide vehicles, vendors, drivers | Vendor-assigned vehicles & drivers only | Assigned vehicle telemetry & shift profile only |
| **Driver Distance Log** | Full fleet roster & 7-day history for all drivers | Vendor driver distance roster | Assigned shift distance only |
| **PDF Audit Reports** | Full download, auto-download, print | Vendor fleet PDF reports | Restricted |
| **Vehicle CRUD** | Create, edit, assign, delete vehicles | Edit driver assignment for vendor vehicles | Restricted |
| **Duty & Break Control** | Monitor duty status & active breaks | Monitor vendor duty status | Toggle shift duty, request Lunch/Tea breaks |

---

## 🌐 7. Production Deployment (Render Setup)

FirstClub FFMS is optimized for seamless deployment on **Render** using Node.js Web Services.

### Deployment Steps on Render
1. Create a **New Web Service** on Render connected to your Git repository.
2. Select **Node** environment.
3. Configure the following build & start commands:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run server`
4. Add a **Persistent Disk** (Mount Path: `/var/data`) on Render to persist SQLite database files (`fleet.db`) and uploaded photo proof images across restarts.
5. Set Environment Variables:
   - `NODE_ENV=production`
   - `JWT_SECRET=<your-secure-random-secret>`
   - `DATA_DIR=/var/data`
   - `UPLOADS_DIR=/var/data/uploads`

---

## 💡 8. Known Architectural Expectations & Limitations

- **Web App (PWA) Background Telemetry**:
  - Telemetry capture in the Web App operates on **Best-Effort 10-Minute Intervals + Immediate Tab Resume Catch-Up Pings + Screen WakeLock**.
  - If a mobile OS forcibly suspends JS execution while screen is locked for extended periods, the Tab Resume Catch-Up Ping automatically captures and timestamps the location the exact moment the driver unlocks or returns to the app tab.
  - Native OS-level background service execution when the screen is locked indefinitely will be supported in the upcoming Capacitor native mobile app.

---

*FirstClub FFMS © 2026 FirstClub Media Operations. All Rights Reserved.*
