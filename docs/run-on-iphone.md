# Run Drop In on your iPhone

Use **Xcode on your Mac** to build and install **Drop In on your iPhone**.
Open Drop In on the phone after installation. This project needs its own
development build because Mapbox and native Google sign-in are not in Expo Go.
You do not need TestFlight for this local development workflow.

## Lightest everyday workflow: Expo server over Wi-Fi

If **Drop In's development build is already installed on your iPhone**, skip
the Xcode and USB steps. From the repository root run:

```bash
npm run start --workspace apps/mobile -- --dev-client --lan
```

Keep both devices on the same Wi-Fi network, then open Drop In and choose the
server, or scan the terminal QR code with your iPhone Camera. Xcode does not
need to stay open. This runs Metro on the Mac without compiling a native app.
Expo Go cannot replace the Drop In development build for this project.

If the development app is not installed and you want to avoid local compilation,
use the existing EAS development profile to build in the cloud:

```bash
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest device:create
npx eas-cli@latest build --platform ios --profile development
```

Follow the device registration instructions on your iPhone, then install the
finished build using EAS's installation link. This requires access to the Expo
project and the Apple Developer team, and may require EAS project setup on the
first run. Enable Developer Mode on the phone if requested. Once installed,
start the Expo server using the command above from the repository root.
Cloud builds can involve queue time and usage charges depending on your plan.
The remaining sections describe the alternative local Xcode installation route.

## 1. Connect your phone

1. Connect your iPhone to your Mac with a USB data cable and unlock it.
2. Tap **Trust This Computer** on the phone if prompted.
3. Open Xcode → **Window → Devices and Simulators** and select your iPhone.
   Wait for pairing and device preparation to finish.
4. On the iPhone, open **Settings → Privacy & Security → Developer Mode**.
   Enable it, restart if requested, then confirm after restarting. If the setting
   is missing, pair with Xcode first.
5. Put the Mac and iPhone on the same Wi-Fi network. Allow local network access
   for Drop In when prompted so it can reach the development server.

## 2. Check signing in Xcode

From the repository root, open the native workspace:

```bash
open apps/mobile/ios/DropIn.xcworkspace
```

If the workspace does not exist, follow step 3 first; Expo generates it.

In **Xcode → Settings → Accounts**, sign in to your Apple developer account.
Select the **DropIn project → DropIn target → Signing & Capabilities**:

- Enable **Automatically manage signing**.
- Select the team authorized to use **com.playdropin.app**.
- Confirm the bundle identifier is **com.playdropin.app**.
- Confirm **Sign in with Apple** is present. The Apple Developer App ID must
  also have this capability enabled.

This app's Apple sign-in capability requires a paid Apple Developer team;
a free Personal Team cannot provision that capability. A local signing
certificate alone does not prove that the team has the necessary provisioning.
Do not change the bundle identifier just to bypass an error: authentication
provider configuration depends on it.

## 3. Build and install

For a fresh checkout, install dependencies with `npm ci` from the repository
root. Keep your existing root `.env`; see the README for initial configuration.
You do not need Docker or a local Supabase server.

From the repository root:

```bash
npm run ios --workspace apps/mobile -- --device
```

Select your physical iPhone from the list. Expo builds the native app, installs
it, and starts Metro (the JavaScript development server). The first build can
take several minutes. Leave the terminal running and the phone unlocked during
installation. Open **Drop In** on the phone if it does not open automatically.

If iOS requests trust for the developer, follow its prompt under
**Settings → General → VPN & Device Management**.

## 4. Start it again later

Once Drop In is installed, most JavaScript changes only need Metro:

```bash
npm run start --workspace apps/mobile -- --dev-client --lan
```

Open **Drop In** and select the development server. Alternatively, scan Metro's
QR code with the iPhone Camera app to open the development build. Keep the Mac
and phone on the same network and allow the Mac's firewall to accept Node's
incoming connections if prompted. Stop Metro with **Ctrl+C** when finished.

Rebuild after adding native libraries or changing native configuration. For
configuration changes that need native project regeneration:

```bash
cd apps/mobile
npx expo prebuild --clean -p ios
npx expo run:ios --device
```

`--clean` recreates the generated iOS directory. Preserve manual native changes
first, and recheck signing afterward. It is not required for ordinary app edits.

## Troubleshooting

- **Phone unavailable or missing:** reconnect the cable, unlock the phone, and
  check pairing/Developer Mode in Xcode's Devices and Simulators window.
  Run `xcrun devicectl list devices` to check visibility.
- **Signing or provisioning error:** check the selected team and Apple sign-in
  capability in step 2. Run `security find-identity -v -p codesigning` to check
  for a local signing identity. Resolve any account/profile errors in Xcode.
- **App opens but cannot load the project:** start Metro using step 4 and check
  Wi-Fi and local network permissions. The development app needs Metro running.
- **Apple sign-in reports RequestUnknownException:** try on the physical phone,
  confirm its Apple Account is signed in, and verify the App ID, signing team,
  provisioning profile, and Sign in with Apple capability. Rebuild after fixing
  native configuration. This error happens before the Supabase token exchange;
  the JavaScript logging line is not the underlying cause.

## References

- [Expo: build locally and select a device](https://docs.expo.dev/guides/local-app-development/)
- [Expo: use a development build](https://docs.expo.dev/develop/development-builds/use-development-builds/)
- [Apple: enable Developer Mode](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device)
- [Expo: Apple authentication configuration](https://docs.expo.dev/versions/latest/sdk/apple-authentication/)
