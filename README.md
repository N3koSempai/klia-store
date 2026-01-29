# KliaStore

![Tests](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/N3koSempai/kliaStore/refs/heads/master/.github/test-results.json)

A modern desktop application for browsing and managing Flatpak applications from Flathub
## Features

- Browse Flathub applications
- View app of the day and apps of the week
- Browse by categories
- Smart caching system for images and app data
- Install Flatpak applications directly
- List your flatpak apps and updates capcities
- Built with Tauri, React, and TypeScript

## Tech Stack

- **Tauri 2**: Desktop application framework
- **React 19**: UI library
- **TypeScript**: Type safety
- **Material UI v7**: Component library
- **TanStack Query**: Data fetching and caching
- **pnpm**: Package manager

## Development

### Prerequisites

- Node.js 20+
- Rust
- npm

### Setup

```bash
# Install dependencies
npm install

# Run development server
npm run tauri dev

# Build for production
npm run tauri build
```

### Testing

```bash
# Run tests (WebDriver)
npm test              # Uses existing binary (fast)
npm run test:rebuild  # Force rebuild
```

> **Note**: When committing with `[release]` in the message, tests run automatically and results are added to the commit.

## Building and Distribution

For detailed instructions on building Flatpak packages and troubleshooting common build issues, see:

**[📖 Build Documentation](./architecture.md#build-and-distribution)**

### Quick Build Commands

**Flatpak:**
```bash
flatpak-builder --user --install --force-clean build-dir com.gatorand.klia-store.yml
flatpak run com.gatorand.klia-store

# Create distributable bundle
flatpak build-bundle ~/.local/share/flatpak/repo klia-store.flatpak com.gatorand.klia-store
```

**Debian Package:**
```bash
pnpm tauri build --bundles deb
sudo dpkg -i src-tauri/target/release/bundle/deb/klia-store_*.deb
```

### Automated Releases

To create an automated release with both .deb and .flatpak packages:

1. Update the version in `package.json`
2. Commit with `[release]` in the message:
   ```bash
   git commit -m "[release] Version 1.0 - Added new features"
   git push
   ```
3. GitHub Actions will automatically:
   - Build .deb and .flatpak packages
   - Create a new release with tag `v{version}`
   - Upload both packages as `Klia-Store-beta{version}.deb` and `Klia-Store-beta{version}.flatpak`

## Documentation

- [Architecture Documentation](./architecture.md) - Detailed technical documentation
- [Contributing Guidelines](./CONTRIBUTING.md) - How to contribute to the project

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## License

[LICENSE](./LICENSE.md)
