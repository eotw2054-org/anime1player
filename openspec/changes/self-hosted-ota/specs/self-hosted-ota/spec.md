## ADDED Requirements

### Requirement: Self-hosted update server on Cloudflare Worker
The app SHALL be able to fetch OTA updates from a self-hosted Cloudflare Worker implementing the Expo Updates protocol v1, instead of EAS / `u.expo.dev`.

#### Scenario: Compatible update available
- **WHEN** the app requests updates with `expo-platform: android`, `expo-runtime-version: 1.0.0`, `expo-channel-name: production`
- **AND** a published update exists for that runtime/channel
- **THEN** the worker returns `multipart/mixed` with a `manifest` part containing `launchAsset` and `assets` whose `url` point to GitHub raw and whose `hash` is `base64url(sha256)`

#### Scenario: No compatible update
- **WHEN** no published update matches the requested runtime version / channel
- **THEN** the worker returns `204 No Update Available`

### Requirement: GitHub-hosted bundle and assets
Update bundles and assets SHALL be stored in the GitHub repository (served via raw URLs); Cloudflare SHALL be used only for the stateless manifest Worker (no R2/KV).

#### Scenario: Asset fetch
- **WHEN** the app downloads the launch bundle or an asset referenced in the manifest
- **THEN** it is served from `raw.githubusercontent.com/eotw2054-org/anime1player/...`

### Requirement: Publish pipeline via GitHub Actions
A GitHub Actions workflow SHALL build the JS bundle and publish it without using EAS.

#### Scenario: Publish an update
- **WHEN** the publish workflow runs (push to master or manual dispatch)
- **THEN** it runs `expo export -p android`, computes `base64url(sha256)` for each file, writes a ready-to-serve manifest, and commits `dist/` + manifest to the repo
- **AND** no Expo account / `eas update` is required

### Requirement: Release notes preserved in self-hosted manifest
The self-hosted manifest SHALL include `extra.expoClient.extra.releaseNotes` so the in-app "更新內容" prompt keeps working.

#### Scenario: Notes shown
- **WHEN** the app reads the self-hosted manifest on update check
- **THEN** `extra.expoClient.extra.releaseNotes` is present and shown in the update prompt

### Requirement: EAS retained as a reversible backup
Switching to self-hosted OTA SHALL be a reversible change to `updates.url`; the `expo-updates` library, `projectId`, and EAS publish flow SHALL be retained.

#### Scenario: Fall back to EAS
- **WHEN** self-hosting needs to be abandoned
- **THEN** changing `app.json` `updates.url` back to `https://u.expo.dev/<projectId>` and rebuilding the APK restores EAS delivery, with no other code changes

#### Scenario: Static runtime version
- **WHEN** building the APK and publishing an update
- **THEN** both use `runtimeVersion "1.0.0"` so they match
