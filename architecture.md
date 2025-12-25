# KliaStore - Architecture Documentation

## Project Overview
KliaStore is a desktop application built with Tauri 2, React, and TanStack Query that provides a frontend for browsing and managing Flathub applications.

## Technology Stack

### Core Technologies
- **Tauri 2**: Desktop application framework (Rust backend)
- **React 19**: UI library
- **TypeScript**: Type-safe JavaScript
- **Vite**: Build tool and dev server
- **Material UI v7**: Component library
- **TanStack Query v5**: Data fetching and caching
- **npm**: Package manager

### Key Tauri Plugins
- `@tauri-apps/plugin-http`: HTTP client for API requests (with `unsafe-headers` feature enabled)
- `@tauri-apps/plugin-opener`: Opening links/files
- `@tauri-apps/plugin-shell`: Execute shell commands (used for Flatpak installation)
- `@tauri-apps/plugin-dialog`: Native dialogs
- `@tauri-apps/plugin-fs`: File system operations
- `@tauri-apps/plugin-sql`: SQLite database

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── CachedImage.tsx # Smart image component with caching
│   └── Terminal.tsx
├── hooks/              # Custom React hooks
│   ├── useCategories.ts
│   ├── useAppOfTheDay.ts
│   ├── useAppsOfTheWeek.ts
│   ├── useAppInitialization.ts
│   └── useCompleteSetup.ts
├── pages/              # Page-level components
│   ├── home/
│   │   ├── Home.tsx
│   │   └── components/
│   │       ├── FeaturedSection.tsx
│   │       ├── AppsOfTheDaySection.tsx
│   │       └── CategoriesSection.tsx
│   ├── welcome/
│   │   └── Welcome.tsx
│   └── appDetails/
│       └── AppDetails.tsx
├── services/           # API and external service integrations
│   └── api.ts
├── types/              # TypeScript type definitions
│   └── index.ts
├── utils/              # Utility functions
│   ├── imageCache.ts   # Image caching manager
│   ├── dbCache.ts      # Database cache manager
│   └── updateChecker.ts # Update checking utility
├── theme/              # MUI theme configuration
│   └── theme.ts
├── App.tsx             # Root component with routing
└── main.tsx           # Application entry point with QueryClient setup
```

## Architecture Principles

### Separation of Concerns
- **Services Layer**: All HTTP/API calls are centralized in `src/services/`
- **Hooks Layer**: Business logic and data fetching wrapped in custom hooks
- **Components Layer**: Presentational components that consume hooks
- **Pages Layer**: Page-level composition of components

### Data Flow
1. **API Service** (`services/api.ts`): Handles raw HTTP requests using Tauri's HTTP plugin
2. **Custom Hooks** (`hooks/`): Wraps API calls with TanStack Query for caching, loading states, and error handling
3. **Components/Pages**: Consume hooks and render UI based on data state

## API Integration

### Flathub API
- Base URL: `https://flathub.org/api/v2`
- Endpoints used:
  - `GET /collection/category`: Returns array of category strings
  - `GET /appOfTheDay`: Returns app of the day details
  - `GET /picks/:collection_id`: Returns apps of the week
  - `GET /appstream/:app_id`: Returns app metadata

### HTTP Configuration
- Tauri HTTP plugin requires URL permissions in `src-tauri/capabilities/default.json`
- Current allowed URLs: `https://flathub.org/*`, `https://dl.flathub.org/*`
- Unsafe headers feature enabled in `src-tauri/Cargo.toml` for flexibility

## Caching System

KliaStore implements a two-tier caching system for optimal performance:

### 1. Image Caching

Smart caching system that stores app images locally to reduce bandwidth and improve loading times.

#### Architecture
- **Location**: `~/.local/share/io.github.N3kosempai.klia-store/cacheImages/`
- **Hashing System**: Uses SHA-256 hash of the image URL as the filename.
- **Image Files**: Named using pattern `{url_hash}.{extension}`

#### Frontend (`src/utils/imageCache.ts`)
- `ImageCacheManager`: Singleton class managing cache operations
- Methods:
  - `getOrCacheImage(appId, imageUrl)`: Main method - checks cache first (by URL hash), downloads if needed
  - `getCachedImagePath(imageUrl)`: Calculates URL hash and checks for existing file with common extensions
  - `cacheImage(appId, imageUrl)`: Downloads and caches new image using URL hash
- Uses `convertFileSrc()` to convert file paths to Tauri-compatible URLs

#### CachedImage Component (`src/components/CachedImage.tsx`)
- React component wrapping image caching logic
- Props: `appId`, `imageUrl`, `alt`, `style`, `className`
- Features:
  - Loading placeholder
  - Automatic fallback to original URL on error
  - Transparent caching (consumer doesn't need to know about cache)

#### Rust Backend (`src-tauri/src/lib.rs`)
Tauri commands:
- `get_cache_image_dir()`: Returns cacheImages directory path
- `clear_old_cache()`: Detects and removes the old index.json based system
- `download_and_cache_image(app_id, image_url)`: Downloads image, hashes URL for filename, saves to disk
- `get_cached_image_path(filename)`: Converts filename to full path

### Cache Flow
1. **First Load**:
   - `CachedImage` calls `getOrCacheImage()`
   - Calculate SHA-256 hash of `imageUrl`
   - Check if file `{hash}.{ext}` exists in `cacheImages`
   - Not found → Download image from URL
   - Save to disk as `{hash}.{ext}`
   - Return cached path

2. **Subsequent Loads**:
   - `CachedImage` calls `getOrCacheImage()`
   - Calculate SHA-256 hash of `imageUrl`
   - Check if file `{hash}.{ext}` exists
   - Found → Return cached path directly
   - Skip download entirely

#### File Format Detection
Automatically detects image type from HTTP `Content-Type` header:
- `image/png` → `.png`
- `image/jpeg` → `.jpg`
- `image/svg+xml` → `.svg`
- `image/webp` → `.webp`
- Default → `.png`

### 2. Database Caching

Intelligent caching system for app data with configurable expiration times to minimize API calls and improve performance.

#### Architecture
- **Database**: SQLite (`~/.local/share/io.github.N3kosempai.klia-store/kliastore.db`)
- **Tables**:
  - `destacados`: Stores app of the day data (daily cache)
  - `apps_of_the_week`: Stores weekly featured apps (daily cache)
  - `categories`: Stores Flathub categories (weekly cache - 7 days)
  - `cache_metadata`: Tracks last update dates per section

#### Cache Strategy
The system uses date-based cache invalidation with configurable durations:
1. **On App Launch**: Check if cached data is older than specified duration
2. **Valid Cache**: Load from SQLite database (no API calls)
3. **Expired Cache**: Fetch from API and update database

**Cache Durations**:
- App of the Day: Daily (0 days = current day only)
- Apps of the Week: Daily (0 days = current day only)
- Categories: Weekly (7 days)

#### Components

**Database Cache Manager** (`src/utils/dbCache.ts`):
- `DBCacheManager`: Singleton managing all DB cache operations
- Key methods:
  - `shouldUpdateSection(sectionName, maxDaysOld)`: Returns true if data is older than maxDaysOld days
  - `getCachedAppOfTheDay()`: Retrieves cached app of the day
  - `cacheAppOfTheDay(app)`: Stores app of the day with current date
  - `getCachedAppsOfTheWeek()`: Retrieves cached weekly apps
  - `cacheAppsOfTheWeek(apps)`: Stores weekly apps with current date
  - `getCachedCategories()`: Retrieves cached categories
  - `cacheCategories(categories)`: Stores categories with current date
  - `updateSectionDate(sectionName)`: Updates last_update_date in cache_metadata

**Database Schema**:
```sql
-- App of the day
CREATE TABLE destacados (
  app_id TEXT PRIMARY KEY,
  name TEXT,
  icon TEXT,
  summary TEXT,
  description TEXT,
  data TEXT NOT NULL,  -- JSON with full app details
  cached_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Apps of the week
CREATE TABLE apps_of_the_week (
  app_id TEXT PRIMARY KEY,
  position INTEGER,
  name TEXT,
  icon TEXT,
  data TEXT NOT NULL,  -- JSON with full app details
  cached_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Cache metadata (tracks update dates)
CREATE TABLE cache_metadata (
  section_name TEXT PRIMARY KEY,
  last_update_date TEXT NOT NULL,  -- YYYY-MM-DD format
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Categories (weekly cache)
CREATE TABLE categories (
  category_name TEXT PRIMARY KEY,
  cached_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### Cache Flow Examples

**App of the Day (Daily Cache)**:
1. **User opens app**
2. `useAppOfTheDay` hook calls `dbCacheManager.shouldUpdateSection("appOfTheDay", 0)`
3. Check `cache_metadata` for last_update_date
4. **If same day**:
   - Load from `destacados` table
   - Return cached data (no API call)
5. **If different day**:
   - Call Flathub API
   - Store in `destacados` table
   - Update `cache_metadata` with current date
   - Return fresh data

**Categories (Weekly Cache)**:
1. **User opens app**
2. `useCategories` hook calls `dbCacheManager.shouldUpdateSection("categories", 7)`
3. Check `cache_metadata` for last_update_date
4. **If less than 7 days old**:
   - Load from `categories` table
   - Return cached data (no API call)
5. **If 7+ days old or no cache**:
   - Call Flathub API
   - Store in `categories` table
   - Update `cache_metadata` with current date
   - Return fresh data

#### Benefits
- **Reduced API Calls**: Only 1 API call per configured period (daily/weekly) instead of every app launch
- **Faster Load Times**: SQLite queries are instant vs network requests
- **Offline Support**: Can show cached data even without internet
- **Bandwidth Savings**: Minimal data transfer for daily usage
- **Flexible Expiration**: Different cache durations for different data types

## Key Implementation Details

### Running the Application
- **Development**: `pnpm tauri dev` (NOT `pnpm run dev`)
  - `pnpm run dev` only runs Vite dev server without Tauri context
  - Tauri APIs (like HTTP plugin) only work in Tauri window
- **Build**: `pnpm tauri build`

### TanStack Query Setup
- QueryClient configured in `src/main.tsx`
- Query keys follow pattern: `["resource-name"]` (e.g., `["categories"]`)
- Automatic caching, refetching, and error handling

### Material UI Grid
- Uses **Grid2** (v2 API) not deprecated Grid v1
- Size prop syntax: `size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}`
- No `item` prop needed in v2

### Consistent Card Heights
- All cards use `height: "100%"` to fill grid cell
- Flexbox layout ensures consistent sizing across grid items

## Application Flow

### First Launch
1. App checks if `appConf.json` exists via `check_first_launch()`
2. If first launch → Shows Welcome page
3. User completes setup → `initialize_app()` creates:
   - `appConf.json` config file
   - `cacheImages/` directory
4. Navigate to Home page

### Home Page Sections

1. **Featured Section** (App of the Day):
   - Fetches from `/appOfTheDay` endpoint
   - Large card with app icon (cached), name, and summary
   - Uses `CachedImage` component
   - Click navigates to app details

2. **Apps of the Week**:
   - Fetches from `/picks/apps-of-the-week`
   - Grid of 5 app cards
   - Each card shows icon (cached), name, position
   - Uses `CachedImage` component
   - Click navigates to app details

3. **Categories Section**:
   - Displays categories from Flathub API
   - Shows skeleton loaders while fetching
   - Cards with image placeholders and category names
   - Responsive grid layout (5 columns on large screens)

## Development Guidelines

### Code Style
- **IMPORTANT**: All code comments must be written in English
- Use clear, descriptive variable and function names
- Follow TypeScript best practices and type safety

### Adding New API Endpoints
1. Add TypeScript types in `src/types/index.ts`
2. Create service method in `src/services/api.ts`
3. Create custom hook in `src/hooks/`
4. Use hook in components

### Adding New Pages
1. Create page component in `src/pages/`
2. Import and use in `App.tsx`

### Styling
- Prefer Material UI's `sx` prop for styling
- Use theme spacing units (e.g., `mb: 4`)
- Keep inline styles minimal

## Common Issues & Solutions

### Issue: "Cannot read properties of undefined (reading 'invoke')"
**Cause**: Running app with `pnpm run dev` instead of `pnpm tauri dev`
**Solution**: Always use `pnpm tauri dev` to access Tauri APIs

### Issue: HTTP requests blocked
**Cause**: URL not in permissions scope
**Solution**: Add URL pattern to `src-tauri/capabilities/default.json`:
```json
{
  "identifier": "http:default",
  "allow": [{ "url": "https://domain.com/*" }]
}
```

### Issue: MUI Grid warnings
**Cause**: Using deprecated Grid v1 API
**Solution**: Use Grid2 component with `size` prop

## Rust Backend Commands

All Tauri commands in `src-tauri/src/lib.rs`:

### App Management
- `check_first_launch()`: Returns boolean if app is first launch
- `initialize_app()`: Creates app directories and config file
- `get_app_data_path(subpath)`: Returns path to app data subdirectory

### Flatpak Installation
- `download_flatpakref(app_id)`: Downloads .flatpakref file
- `install_flatpak(app_id)`: Installs Flatpak app with real-time output events
  - Emits: `install-output`, `install-error`, `install-completed`

### Image Caching
- `get_cache_image_dir()`: Returns cacheImages directory path
- `read_cache_index()`: Reads index.json cache index
- `write_cache_index(content)`: Writes cache index
- `download_and_cache_image(app_id, image_url)`: Downloads and caches image
- `get_cached_image_path(filename)`: Converts filename to full path

## Build and Distribution

### Building Flatpak

KliaStore can be distributed as a Flatpak package. The build process is complex and requires several dependencies.

#### Prerequisites

```bash
# Install Flatpak build tools
sudo apt install flatpak flatpak-builder

# Install runtime and SDK
flatpak install --user flathub org.gnome.Platform//49
flatpak install --user flathub org.gnome.Sdk//49

# Install SDK extensions for Rust and Node
flatpak install --user flathub org.freedesktop.Sdk.Extension.rust-stable//25.08
flatpak install --user flathub org.freedesktop.Sdk.Extension.node20//25.08
```

#### Build Process

The Flatpak build is configured in `io.github.N3kosempai.klia-store.yml` manifest file.

**Build command:**
```bash
flatpak-builder --user --install --force-clean build-dir io.github.N3kosempai.klia-store.yml
```

**Run the Flatpak:**
```bash
flatpak run io.github.N3kosempai.klia-store
```

**Create distributable bundle:**
```bash
flatpak build-bundle ~/.local/share/flatpak/repo klia-store.flatpak io.github.N3kosempai.klia-store
```

#### Build Configuration

The manifest uses:
- **Runtime**: GNOME Platform 49
- **SDK**: GNOME SDK 49
- **Node**: Node 20.x via SDK extension
- **Rust**: Rust stable via SDK extension
- **Package Manager**: npm (migrated from pnpm for Flathub compatibility)

#### Offline Build System for Flathub

**IMPORTANT**: Flathub requires builds without network access. The project uses offline source generation:

1. **Generate offline sources** (must be regenerated when dependencies change):
   ```bash
   # Install flatpak-builder-tools
   git clone https://github.com/flatpak/flatpak-builder-tools.git /tmp/flatpak-builder-tools

   # Setup Python venv and install dependencies
   cd /tmp/flatpak-builder-tools/node
   python3 -m venv venv
   source venv/bin/activate
   pip install .

   # Generate npm offline sources (--no-xdg-layout is CRITICAL)
   python3 -m flatpak_node_generator --no-xdg-layout --no-requests-cache --retries 10 npm /path/to/package-lock.json -o generated-sources.json

   # Generate Cargo offline sources
   pip3 install tomlkit  # Required dependency
   python3 /tmp/flatpak-builder-tools/cargo/flatpak-cargo-generator.py /path/to/Cargo.lock -o cargo-sources.json
   ```

2. **Critical npm cache configuration**:
   - flatpak-builder downloads sources to `flatpak-node/npm-cache`
   - npm must be configured to use this cache: `npm_config_cache: /run/build/klia-store/flatpak-node/npm-cache`
   - **Without this path match, npm cannot find offline sources and build fails**

#### Key Build Steps

1. **Install dependencies**: `npm install --offline --no-save --include=dev`
   - Uses offline sources from `generated-sources.json`
   - Requires `npm_config_cache` pointing to `flatpak-node/npm-cache`
2. **Build application**: `npm run tauri build -- --bundles deb`
   - Creates the binary executable
   - Generates a .deb package
3. **Install files**: Binary, desktop file, icon, and metainfo to `/app/`

#### Important Environment Variables

```yaml
CI: 'true'                                              # Prevents interactive prompts
TAURI_PLATFORM_TYPE: 'Linux'
TAURI_ENV_PRODUCTION: 'true'
npm_config_cache: /run/build/klia-store/flatpak-node/npm-cache  # MUST match flatpak-builder source path
npm_config_prefix: /run/build/klia-store/npm-global    # Writable npm prefix
CARGO_HOME: /run/build/klia-store/cargo                # Cargo dependencies cache
```

### Building .deb Package

The Tauri build process automatically creates a .deb package alongside the Flatpak build.

**Location after build:**
```
src-tauri/target/release/bundle/deb/klia-store_0.1.0_amd64.deb
```

**Install the .deb:**
```bash
sudo dpkg -i src-tauri/target/release/bundle/deb/klia-store_0.1.0_amd64.deb
```

### Troubleshooting

#### Problem: "cfg(dev) enabled in production build"
**Symptoms**: Application shows "Could not connect to localhost" with blank screen.

**Cause**: Building with `cargo build` directly instead of using Tauri CLI sets development flags.

**Solution**: Always use `npm run tauri build` which correctly sets production configuration flags.

#### Problem: "npm error code ENOTCACHED" during Flatpak build
**Symptoms**: `npm install --offline` fails with "cache mode is 'only-if-cached' but no cached response is available"

**Cause**: npm cache path mismatch. flatpak-builder downloads sources to `flatpak-node/npm-cache` but npm is looking elsewhere.

**Solution**: Set `npm_config_cache: /run/build/klia-store/flatpak-node/npm-cache` in manifest build-options env to match where flatpak-builder stores sources.

#### Problem: Offline sources not working (npm cache empty)
**Symptoms**: `npm cache verify` shows "Content verified: 0 (0 bytes)", build fails offline

**Root Causes**:
1. `generated-sources.json` created without `--no-xdg-layout` flag
2. `npm_config_cache` environment variable pointing to wrong directory
3. Using old `flatpak-npm-generator.py` instead of modern `flatpak_node_generator`

**Solution**:
1. Regenerate with: `python3 -m flatpak_node_generator --no-xdg-layout npm package-lock.json -o generated-sources.json`
2. Ensure `npm_config_cache: /run/build/klia-store/flatpak-node/npm-cache` in manifest
3. Include offline sources in manifest: `sources: [./generated-sources.json, ./cargo-sources.json]`

#### Problem: Flatpak build fails on AppImage/RPM bundler
**Cause**: Default Tauri builds include appimage and rpm bundles that require additional dependencies.

**Solution**: Use `--bundles deb` flag to only create the binary and deb package:
```bash
npm run tauri build -- --bundles deb
```

#### Problem: MUI Grid2 type errors during build
**Cause**: Material UI v7 changed Grid API but types may not be compatible.

**Solution**: Use Box with flexbox instead:
```tsx
// Instead of Grid
<Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
  <Box sx={{ flex: "0 0 auto" }}>
    {/* content */}
  </Box>
</Box>
```

#### Problem: "ENOENT: no such file or directory, mkdir '/usr/lib/sdk/node20/lib/node_modules'"
**Cause**: npm trying to install to read-only SDK directory.

**Solution**: Configure `npm_config_prefix` to point to writable build directory.

#### Problem: Extensions not found (rust-stable//XX.XX/x86_64/XX)
**Cause**: SDK extension version mismatch with GNOME runtime base.

**Solution**: Match SDK extension versions to runtime base:
- GNOME 48 → Freedesktop SDK 23.08 extensions
- GNOME 49 → Freedesktop SDK 25.08 extensions

#### Build Performance Tips

1. **Offline sources**: Generate `generated-sources.json` and `cargo-sources.json` for builds without network access
2. **Cache npm packages**: `npm_config_cache` environment variable must point to `flatpak-node/npm-cache`
3. **Cargo cache**: Set `CARGO_HOME` to persist Rust dependencies
4. **Clean builds**: Use `--force-clean` to ensure reproducible builds

#### Flathub Submission Requirements

For Flathub submission, the following are required:

1. **No network access during build**: Use offline sources (`generated-sources.json`, `cargo-sources.json`)
2. **Metadata files**:
   - `flathub.json`: Justifications for special permissions (flatpak-spawn, system-talk, filesystem access)
   - `io.github.N3kosempai.klia-store.metainfo.xml`: AppStream metadata with `<url type="vcs-browser">`
3. **Manifest**: `io.github.N3kosempai.klia-store.yml` with offline sources included
4. **Source files committed**: Both `generated-sources.json` and `cargo-sources.json` must be in repository

## Update Badge System

KliaStore includes a notification system that displays the number of available updates on the "My Apps" button in the Home page.

### Architecture

The system uses a centralized state management approach with Zustand store to track available updates:

1. **Update Checking Utility** (`src/utils/updateChecker.ts`):
   - `checkAvailableUpdates()`: Calls Rust backend to check for Flatpak updates
   - Returns array of `UpdateAvailableInfo` objects
   - Centralized function used by multiple components

2. **Zustand Store** (`src/store/installedAppsStore.ts`):
   - `availableUpdates`: Record mapping appId to update information
   - `updateCount`: Number of apps with available updates
   - `setAvailableUpdates()`: Updates both the map and count
   - `getUpdateCount()`: Returns current count for badge display
   - `hasUpdate(appId)`: Check if specific app has update
   - `getUpdateInfo(appId)`: Get update details for specific app

3. **Loading Flow**:
   - On app startup, `useInstalledApps` hook loads installed Flatpak apps
   - After loading apps list, automatically calls `checkAvailableUpdates()`
   - Updates stored in Zustand store and available app-wide
   - Badge on "My Apps" button reflects real-time count

4. **UI Components**:
   - **Home.tsx** (`src/pages/home/Home.tsx`):
     - Displays Badge with `updateCount` on "My Apps" button
     - Badge only visible when `updateCount > 0`
     - Uses Material UI `Badge` component with `color="error"`

   - **MyApps.tsx** (`src/pages/myApps/MyApps.tsx`):
     - Uses cached data from Zustand store
     - No redundant update checks when entering page
     - Only re-checks updates after successful app update
     - Shows "Update" button for apps with available updates
     - Displays release notes modal with version information

### Benefits

- **Single Source of Truth**: All update data stored in centralized Zustand store
- **Performance**: Update check only happens once on startup (or after updates)
- **User Experience**: Badge provides immediate visual feedback about pending updates
- **Data Reuse**: MyApps page uses cached data, no redundant API calls
- **Modularity**: Update checking logic separated into utility function

### Flow Diagram

```
App Startup
    ↓
useInstalledApps hook
    ↓
Load installed apps (Rust)
    ↓
checkAvailableUpdates()
    ↓
setAvailableUpdates() → Updates store
    ↓
Home.tsx reads updateCount → Shows badge
    ↓
User clicks "My Apps"
    ↓
MyApps.tsx reads from store → Shows update buttons
    ↓
User updates app
    ↓
checkAvailableUpdates() → Refresh data
```

## Future Considerations

- Implement search functionality
- Add state management if needed (Zustand/Redux)
- Add error boundaries
- Category filtering and browsing
- Uninstall functionality
- Cache cleanup/management UI
- Offline mode support
- Submit to Flathub repository
- Auto-check for updates periodically in background
