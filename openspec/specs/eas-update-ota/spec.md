# EAS Update (OTA) Specification

## Purpose

Deliver JavaScript bundle changes to the AnimePlayer app over-the-air via EAS Update, so pure-JS changes ship without rebuilding or re-sideloading the APK. The app is built locally (`gradlew`, not EAS Build) and sideloaded, so the channel and runtime version are pinned manually in `app.json`.

## Requirements

### Requirement: OTA delivery of JS changes via EAS Update
The app SHALL fetch over-the-air JS bundle updates from EAS Update on the `production` channel, so that pure-JS changes can be delivered without rebuilding or reinstalling the APK.

#### Scenario: New JS update is available
- **WHEN** a new update is published to the `production` channel with a matching runtime version
- **AND** the installed app launches with network access
- **THEN** the app downloads the new JS bundle from `https://u.expo.dev/<projectId>`

#### Scenario: No update available
- **WHEN** no newer update exists for the app's runtime version and channel
- **THEN** the app continues running the embedded bundle without error

### Requirement: Channel pinned for locally built (non-EAS-Build) APK
Because the APK is built locally (not via EAS Build), the app SHALL declare its channel through the `expo-channel-name` request header in `app.json`, and the `production` channel SHALL exist on the EAS server.

#### Scenario: Locally built app resolves its channel
- **WHEN** the locally built APK requests updates
- **THEN** it sends `expo-channel-name: production` and only receives updates published to that channel

### Requirement: Runtime version uses a static string
The app SHALL use a static `runtimeVersion` string (e.g. `"1.0.0"`) so the locally-built APK and `eas update` always agree on the runtime version. (The `fingerprint` policy was tried and rejected: a local `gradlew` build embeds a different fingerprint hash than the `eas update` CLI computes, so the server reports "no compatible update" and OTA is never delivered.)

#### Scenario: Published update runtime matches the APK
- **WHEN** an update is published with `runtimeVersion` `"1.0.0"` and the installed APK was built with `runtimeVersion` `"1.0.0"`
- **THEN** the update is delivered to that APK over the air

#### Scenario: Native change requires a manual bump + rebuild
- **WHEN** a native dependency, plugin, permission, or the Expo/RN version changes
- **THEN** the developer bumps `runtimeVersion` (e.g. `"1.0.1"`) and rebuilds + re-sideloads the APK
- **AND** updates published under the new runtime version are NOT delivered to the old APK

### Requirement: In-app update prompt with immediate reload
On launch in production builds, the app SHALL check for and download an available update, and SHALL prompt the user; on confirmation it SHALL reload into the new bundle immediately.

#### Scenario: User accepts an available update
- **WHEN** an update has been downloaded and is new
- **THEN** the app shows a prompt offering to update
- **AND** when the user confirms, the app calls `reloadAsync()` and runs the new bundle

#### Scenario: User defers the update
- **WHEN** the prompt is shown and the user chooses to defer
- **THEN** the app keeps running the current bundle and the downloaded update applies on a later launch

#### Scenario: Update check fails or device is offline
- **WHEN** the update check or download throws (no network, server error)
- **THEN** the error is handled silently and normal app usage is not blocked

#### Scenario: Development build is excluded
- **WHEN** the app runs in development (`__DEV__`)
- **THEN** no OTA check is performed (Metro serves the bundle)
