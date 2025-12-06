# KliaStore

A modern desktop application for browsing and managing Flatpak applications from Flathub.

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
- pnpm (`corepack enable pnpm`)

### Setup

```bash
# Install dependencies
pnpm install

# Run development server (IMPORTANT: use tauri dev, not just dev)
pnpm tauri dev

# Build for production
pnpm tauri build
```

> **Important**: Always use `pnpm tauri dev` instead of `pnpm dev`. The Tauri context is required for the app to function properly.

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
