# KliaStore

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

## Crypto Donations Integration

Klia Store supports crypto donations (Bitcoin and Ethereum tokens) for app developers. Developers can add donation URLs to their Flathub apps to receive direct support from users.

### How to Add Crypto Donations to Your App

Follow these steps to enable crypto donations for your Flathub application:

#### 1. Prepare Your Wallet Addresses

You'll need one or both of the following:
- **Bitcoin (BTC)** wallet address
- **Ethereum (ETH)** wallet address (supports all ERC-20 tokens)

#### 2. Add Donation URLs to Your Flathub Manifest

Edit your app's `.metainfo.xml` file and add the donation URLs in the `<url>` section:

**For Bitcoin:**
```xml
<url type="donation">https://kliastore.gatorand.com/bitcoin/?wallet=YOUR_BTC_ADDRESS</url>
```

**For Ethereum (any ERC-20 token):**
```xml
<url type="donation">https://kliastore.gatorand.com/ethereum/?wallet=YOUR_ETH_ADDRESS</url>
```

**Example (Klia Store configuration):**
```xml
<component>
  <id>io.github.N3kosempai.klia-store</id>
  <name>Klia Store</name>
  <!-- ... other metadata ... -->
  <url type="homepage">https://github.com/N3koSempai/kliaStore</url>
  <url type="donation">https://kliastore.gatorand.com/bitcoin/?wallet=bc1q5y8are6m9r946h3ut7c3hxtuf6nm67rgz7ume7</url>
  <url type="donation">https://kliastore.gatorand.com/ethereum/?wallet=0x1234567890abcdef1234567890abcdef12345678</url>
</component>
```

#### 3. Supported Cryptocurrencies

Currently supported:
- ✅ **Bitcoin (BTC)** - Native Bitcoin network
- ✅ **USDT (Tether)** - Ethereum network (ERC-20)

Coming soon:
- 🔜 USDC, DAI, and other ERC-20 tokens
- 🔜 Other blockchains

#### 4. How It Works

1. Users browse your app in Klia Store
2. They click the donation button (⚡ icon)
3. Select cryptocurrency and enter amount
4. Scan QR code or copy wallet address
5. Send the exact amount from their wallet
6. Click "Verify" to confirm the transaction on-chain
7. Donation is recorded in local database

#### 5. Features

- **On-chain verification**: Transactions are verified using blockchain APIs (Blockstream/Mempool for BTC, Ethereum RPC nodes for USDT)
- **QR code generation**: Automatic QR codes for easy mobile wallet scanning
- **BIP-21 support**: Bitcoin URIs include amount for auto-fill in wallets
- **Local tracking**: All donations are stored in SQLite database
- **Privacy-focused**: No external tracking, only blockchain verification

#### 6. Important Notes

- Replace `YOUR_BTC_ADDRESS` and `YOUR_ETH_ADDRESS` with your actual wallet addresses
- A single Ethereum address can receive all ERC-20 tokens (USDT, USDC, DAI, etc.)
- Ensure your wallet addresses are correct before publishing
- Users must send the **exact amount** specified for verification to work
- Transactions typically take a few minutes to appear on-chain

## Documentation

- [Architecture Documentation](./architecture.md) - Detailed technical documentation
- [Contributing Guidelines](./CONTRIBUTING.md) - How to contribute to the project

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## License

[LICENSE](./LICENSE.md)
