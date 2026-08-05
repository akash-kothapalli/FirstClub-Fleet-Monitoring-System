# FirstClub FFMS – LED Fleet Tracking & Field Force Management System

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-Proprietary-blue.svg)]()
[![Production Ready](https://img.shields.io/badge/production-ready-emerald.svg)]()

FirstClub FFMS is a high-precision, enterprise-grade **LED Van Fleet Monitoring & Field Force Management Platform** built for real-time telemetry ingestion, cellular dead-zone offline buffering, campaign corridor auditing, automated geofence breach detection, role-based vendor access control, and 40-minute driver photo proof uploads.

---

## 📋 1. Project Overview

### What the Project Does
FirstClub FFMS tracks digital out-of-home (DOOH) LED campaign trucks operating across major Indian metropolitan corridors (Bengaluru, Mumbai, Delhi, Hyderabad). It processes live GPS telemetry pings, buffers offline dead-zone data via IndexedDB, calculates actual daily distance (km) and operational duty hours, alerts on geofence deviations or excessive halts, and generates executive PDF audit reports for client billing proof.

### Key Features
- **Real-Time GPS Telemetry & Heatmap**: Live tracking of moving, idle, and on-break LED vans with smooth auto-centering, zoom, dynamic marker status, and dynamic density heatmap overlays.
- **IndexedDB Dead-Zone Offline Buffering**: Automatic client-side queuing of telemetry pings in browser `IndexedDB` during cellular dead zones, with auto-flushing to `POST /api/telemetry/batch` when network connection is restored.
- **2D Geographic City Detection**: Genuine 2D bounding-box spatial coordinate matching for Bengaluru, Mumbai, Delhi, and Hyderabad with `'Unknown City'` fallback handling.
- **Strict Role Isolation**:
  - **Super Admin / Ops Manager (`ops_manager`)**: Full nationwide fleet visibility, vehicle CRUD, SLA breach monitoring, and PDF report generation.
  - **Vendor Manager (`vendor_manager`)**: Scoped exclusively to assigned vendor fleet (`v1` Akash Outdoor Media). Cannot access or tamper with other vendors' vehicles or alerts.
  - **Driver (`driver`)**: Scoped strictly to assigned vehicle telemetry, Start/End Shift duty toggle, hardware GPS mode, approved break controls, driver profile registration, and multi-photo proof uploads.
- **State Persistence**: SQLite database persistence across page reloads for driver shift duty status, active break selection (Lunch, Tea, Service), and hardware GPS toggle mode.
- **Real-Time Server-Sent Events (SSE)**: Low-latency SSE streaming (`/api/events`) for instant broadcast of vehicle movements, status updates, and critical alerts.
- **40-Min Multi-Photo Proof Upload**: Multi-select camera & gallery image upload (up to 4 images per submission) with automated 40-minute countdown timer for proof of campaign execution.
- **Automated PDF Report Generation**: Dynamic multi-vehicle PDF audit report generator with campaign summary, route map visualization, hour-by-hour breakdown, and photo proof exhibits.

---

## 🛠️ 2. Tech Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend Framework** | React 18 (Vite 6) | Component-driven UI with low-latency client rendering |
| **Styling** | Modern Vanilla CSS | Modern dark glassmorphism aesthetic with CSS custom properties |
| **Client Storage** | IndexedDB (`fleet_offline_db`) | Offline telemetry ping buffering during cellular dead zones |
| **Maps & Spatial** | Leaflet 1.9.4 & HTML5 Canvas | Lightweight interactive mapping, tile caching, dynamic heatmap density circles |
| **Backend Core** | Node.js 24 + Express 4 | REST API backend, static file serving, and security middleware |
| **Database** | Node SQLite (`node:sqlite`) | High-performance embedded SQLite database with WAL (Write-Ahead Logging) mode |
| **Real-Time Streaming** | Server-Sent Events (SSE) | Unidirectional event streaming (`/api/events`) with automatic client reconnection |
| **Authentication** | HMAC-SHA256 Signed JWT | Secure cookie & Bearer token authentication with session revocation |
| **PDF Generation** | HTML Canvas & PDFKit Pattern | Dynamic multi-vehicle executive daily audit report generation |
| **Build & Deploy** | Vite, Docker, Docker Compose, PM2 | Multi-stage Docker deployment, fast production bundling |

---

## 📁 3. Project Structure

```
led-fleet-monitoring/
├── Dockerfile                  # Production Alpine Node multi-stage container definition
├── docker-compose.yml          # Container orchestration with data & upload volume persistence
├── index.html                  # Single Page Application HTML entry point
├── package.json                # Project dependencies, scripts, and engine specs
├── pm2.config.js               # PM2 Process Manager configuration
├── vite.config.js              # Vite server & API proxy configuration
├── data/                       # SQLite WAL database directory (persisted volume)
│   └── fleet.db
├── public/                     # Static assets (logos, icons, default images)
├── uploads/                    # Physical upload storage for campaign photo proofs (persisted volume)
│   └── proofs/
├── server/                     # Backend Express server modules
│   ├── index.js                # Server entry point, middleware setup, SSE stream
│   ├── db.js                   # SQLite schema initialization, safe migrations, seeds
│   ├── alerts.js               # Automated alert evaluation rules (geofence, idle, speed)
│   ├── geofence.js             # 2D Ray-Casting Point-in-Polygon & reverse geocoding
│   ├── logger.js               # Structured logging utility
│   ├── pdfBuilder.js           # Daily audit PDF report generator engine
│   ├── middleware/
│   │   └── auth.js             # JWT verification, session tracking, role-based guard
│   ├── routes/
│   │   ├── auth.js             # Login, logout, session verification routes
│   │   ├── vehicles.js         # Vehicle CRUD, settings persistence, driver assignment
│   │   ├── telemetry.js        # Live GPS ping ingestion, batch upload, photo proofs
│   │   ├── campaigns.js        # Campaign corridors and geofence definitions
│   │   └── reports.js          # Executive PDF audit report endpoints
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
│   │   ├── FleetMap.jsx        # Leaflet map instance, dynamic markers, heatmap layer
│   │   ├── Header.jsx          # Header navigation bar, user profile, logout
│   │   ├── ReportModal.jsx     # Dynamic multi-vehicle PDF audit report modal
│   │   ├── RouteReplay.jsx     # Historical GPS breadcrumb route playback
│   │   └── StatsOverview.jsx   # High-level fleet KPIs (Total Distance, Active Vans, SLA)
│   ├── context/
│   │   ├── AuthContext.jsx     # Authentication state & user context
│   │   └── FleetContext.jsx    # Live vehicle state, SSE listener, alert state
│   └── services/
│       ├── api.js              # Fetch wrapper with auto token injection & error handling
│       └── geolocation.js      # HTML5 navigator.geolocation & IndexedDB offline queue
└── tests/                      # Automated unit & security test suites
    ├── alertRules.test.js      # Alert evaluation unit tests
    ├── auth.test.js           # JWT & password hashing tests
    ├── geofence.test.js        # Ray-casting point-in-polygon math tests
    ├── offlineSync.test.js     # Batch telemetry ingestion & offline queue tests
    ├── testRunner.js           # Test suite execution runner
    └── vendorScoping.test.js   # Vendor role scoping isolation security tests
```

---

## ⚙️ 4. Prerequisites

Before setting up FirstClub FFMS locally or in production, ensure your system meets the following requirements:

- **Node.js**: Version `>=20.0.0` (LTS recommended, tested on `v24.18.1`)
- **npm**: Version `>=10.0.0`
- **Operating System**: Windows, macOS, or Linux (Ubuntu 22.04 LTS tested)
- **Environment Variables**:
  - `PORT`: Server HTTP port (Default: `3000`)
  - `NODE_ENV`: Application environment (`development` or `production`)
  - `JWT_SECRET`: HMAC-SHA256 signing secret key

---

## 🚀 5. Local Setup & Quick Start

Follow these step-by-step instructions to run FirstClub FFMS on your local machine:

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Run Automated Unit & Security Tests
Verify that all core math, auth, scoping security, and offline batch sync tests pass:
```bash
npm test
```

### Step 3: Build Production Assets
Build the Vite React frontend into the `dist/` directory:
```bash
npm run build
```

### Step 4: Start Backend & Application Server
Launch the Express server with SQLite WAL database initialization:
```bash
npm run server
```

### Step 5: Production User Credentials

| Role | Name | Email | Password | Scope |
| :--- | :--- | :--- | :--- | :--- |
| **Ops Manager 1** | Akash | `akash.kothapalli@firstclub.co.in` | `password123` | Full Nationwide Operations |
| **Ops Manager 2** | Bapu Kale | `bapu.kale@firstclub.co.in` | `password123` | Full Nationwide Operations |
| **Vendor Manager** | Akash | `vendor.akash@firstclub.co.in` | `password123` | Scoped to Akash Outdoor Media (`v1`) |

---

## 🔐 6. Role-Based Access Control (RBAC) Matrix

FirstClub FFMS strictly enforces role-based authorization at both the API layer (Express middleware) and the UI layer (React Context).

| Privilege / Capability | Super Admin (`super_admin`) | Operations Manager (`ops_manager`) | Vendor Manager (`vendor_manager`) | Driver (`driver`) |
| :--- | :---: | :---: | :---: | :---: |
| **Purpose of Role** | System oversight & tenant management | Nationwide fleet monitoring & campaign SLA execution | Vendor-specific vehicle management | Active shift duty & live location transmission |
| **View Scope** | All nationwide vehicles, vendors, drivers, alerts | All nationwide vehicles, vendors, drivers, alerts | Vendor-assigned vehicles & drivers only | Assigned vehicle telemetry & shift profile only |
| **Create Scope** | Vendors, Users, Vehicles, Campaigns | Vehicles, Campaigns, User Profiles | Assigned Driver Profiles | Telemetry pings, Photo proofs, Break events |
| **Edit Scope** | All system records | All vehicle assignments & target corridors | Vendor-owned vehicle driver links | Driver contact profile & shift break toggles |
| **Delete Scope** | All system records | Vehicles, Alerts, Campaigns | Restricted (No vehicle deletion) | Restricted |
| **Accessible Modules**| All Modules | All Modules | Dashboard, Map, Vehicle Roster, Alerts, Reports | Driver App Shift Interface |
| **Restricted Modules** | None | System Tenant Config | Admin Roster (Cross-vendor), Global System Config | Command Center, Admin CRUD, Global Heatmap |
| **Dashboard Access** | Full Read/Write | Full Read/Write | Vendor-Scoped View Only | Restricted |
| **Reports & PDF** | Full Download & Audit | Full Download & Audit | Vendor Fleet Reports Only | Restricted |
| **GPS Tracking** | Full Multi-Vehicle Map | Full Multi-Vehicle Map | Vendor Fleet Map Only | Live Transmit Mode Only |
| **Vehicle CRUD** | Full Control | Full Control | Read / Edit Assigned Driver | Restricted |
| **Campaign Config** | Full Control | Full Control | View Assigned Campaigns | View Assigned Campaign Corridor |

---

## 🧩 7. Functional Overview & Module Architecture

### 1. Authentication Module
- **Purpose**: Authenticates system users via HMAC-SHA256 signed JSON Web Tokens (JWT) stored in `HttpOnly` cookies.
- **Features**: Salted SHA-256 password verification, active session tracking in `sessions` table, token revocation on logout.
- **Roles**: All Roles (`ops_manager`, `vendor_manager`, `driver`).
- **Input**: Email address & password string.
- **Output**: Authenticated user object & signed HTTP cookie (`fleet_token`).
- **Database Tables**: `users`, `sessions`.
- **APIs**: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.

### 2. Operations Command Center Dashboard
- **Purpose**: High-level executive fleet overview for tracking total active vans, SLA delivery percentages, geofence breaches, and distance metrics.
- **Features**: Interactive KPI stat cards, real-time alert feed, live fleet map integration, and rapid search filters.
- **Roles**: `ops_manager`, `vendor_manager`.
- **Input**: User role token, city & vendor filter selections.
- **Output**: Rendered metrics, active vehicle counts, alert triggers.
- **Database Tables**: `vehicles`, `alerts`, `campaigns`.
- **APIs**: `GET /api/vehicles`, `GET /api/alerts`.

### 3. Driver Shift App & Offline Queue Module
- **Purpose**: Field interface for drivers to manage shift duties, toggle smartphone hardware GPS, request breaks, and upload campaign photo proofs with Gallery multi-photo selection and IndexedDB offline buffering.
- **Features**: Modern toggle switches, 40-minute proof countdown timer, break buffer controls (Lunch, Tea, Service), IndexedDB offline ping store (`queued_pings`), auto-flushing network event listener (`window.addEventListener('online')`), gallery multi-photo upload (up to 4 images), and dynamic reverse-geocoded location display.
- **Roles**: `driver`.
- **Input**: Device GPS coordinates (`navigator.geolocation`), IndexedDB buffer, multi-image camera/gallery uploads, shift break toggles.
- **Output**: Ingested telemetry pings, batch synced offline pings, photo proof records in SQLite, real-time SSE broadcasts.
- **Database Tables**: `vehicles`, `telemetry_pings`, `approved_breaks`, `campaign_photo_proofs`.
- **APIs**: `POST /api/vehicles/settings`, `POST /api/telemetry/ping`, `POST /api/telemetry/batch`, `POST /api/telemetry/breaks/toggle`, `POST /api/telemetry/photo-proof`.

### 4. Admin Vehicle Roster CRUD
- **Purpose**: Management table for creating, updating, and assigning LED vans to vendors and drivers.
- **Features**: 6-column tabular layout (Driver Name, Primary Mobile, Plate Number, Vendor, City, Actions) with auto-population of driver contact details.
- **Roles**: `ops_manager` (Full CRUD), `vendor_manager` (Scoped Read/Edit).
- **Input**: Vehicle ID, plate number, vendor ID, driver ID, display dimensions, current city.
- **Output**: Created or updated vehicle rows in SQLite database.
- **Database Tables**: `vehicles`, `users`, `vendors`.
- **APIs**: `GET /api/vehicles`, `POST /api/vehicles`, `PUT /api/vehicles/:id`, `DELETE /api/vehicles/:id`.

### 5. Live Fleet Map & Heatmap Module
- **Purpose**: Visual spatial tracking of all vehicles with live status markers, auto-centering, zoom invalidation, and dynamic density heatmap overlays.
- **Features**: Dynamic Leaflet map canvas, custom status icons (Moving 🟢, Idle 🟡, Break 🔵, Offline ⚪), dynamic circle density heatmap toggle.
- **Roles**: `ops_manager`, `vendor_manager`.
- **Input**: Vehicle lat/lng coordinates, selected vehicle ID.
- **Output**: Rendered map tiles, animated markers, circle density layers.
- **Database Tables**: `vehicles`, `telemetry_pings`.
- **APIs**: `GET /api/vehicles`, `GET /api/events` (SSE Stream).

### 6. Historical Route Replay Module
- **Purpose**: Breadcrumb playback of a vehicle's historic path during a specific date to verify campaign corridor coverage.
- **Features**: Time-series slider, animated marker movement along polylines, speed graph.
- **Roles**: `ops_manager`, `vendor_manager`.
- **Input**: `vehicle_id`, selected `date`.
- **Output**: Array of ordered breadcrumb pings (`lat`, `lng`, `speed`, `timestamp`).
- **Database Tables**: `telemetry_pings`.
- **APIs**: `GET /api/replay?vehicle_id=...&date=...`.

### 7. Campaign & Geofence Management
- **Purpose**: Defines advertising campaigns, targeted daily distance goals, and 2D polygon geofence corridors.
- **Features**: 2D Ray-Casting point-in-polygon boundary checks, campaign-vehicle binding.
- **Roles**: `ops_manager`.
- **Input**: Campaign name, client, target city, daily km target, geofence polygon JSON coordinates.
- **Output**: Configured campaign records and spatial boundary definitions.
- **Database Tables**: `campaigns`, `vehicle_campaigns`.
- **APIs**: `GET /api/campaigns`, `POST /api/campaigns`.

### 8. Executive PDF Report Generation
- **Purpose**: Generates official, multi-page daily audit reports for client billing proof.
- **Features**: Dynamic multi-vehicle selection, summary statistics, hour-by-hour operational breakdown, route map graphic exhibit, and photo proof timestamps.
- **Roles**: `ops_manager`, `vendor_manager`.
- **Input**: `vehicle_id`, target `date`.
- **Output**: Downloadable formatted PDF document.
- **Database Tables**: `vehicles`, `telemetry_pings`, `campaign_photo_proofs`, `alerts`.
- **APIs**: `GET /api/reports/daily?vehicle_id=...&date=...`.

---

## 💾 10. Production SQLite Database Operations & Access Guide

### Database Path & Storage
- **Production Path**: `/app/data/fleet.db`
- **WAL Log Files**: `/app/data/fleet.db-wal` & `/app/data/fleet.db-shm`
- **Render Disk Mount**: `/app/data` and `/app/uploads`

### Accessing Database in Production
1. Go to [Render Dashboard](https://dashboard.render.com/) -> Select **FirstClub-Fleet-Monitoring-System** -> **Shell**.
2. Run SQLite CLI:
   ```bash
   sqlite3 /app/data/fleet.db
   ```

### Backup & Restore
- **Live Atomic Backup**:
  ```bash
  sqlite3 /app/data/fleet.db ".backup '/app/data/fleet_backup.db'"
  ```
- **Database Restoration**:
  ```bash
  cp /app/data/fleet_backup.db /app/data/fleet.db
  rm -f /app/data/fleet.db-wal /app/data/fleet.db-shm
  ```

---

*FirstClub FFMS © 2026 FirstClub Media Operations. All Rights Reserved.*
