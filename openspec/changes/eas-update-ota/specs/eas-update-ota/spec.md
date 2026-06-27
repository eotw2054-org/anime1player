## ADDED Requirements

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

### Requirement: Runtime version uses fingerprint policy
The app SHALL use `runtimeVersion.policy = "fingerprint"` so that any change affecting the native runtime automatically changes the runtime version, preventing JS-bundle/native mismatch.

#### Scenario: Native change forces a new runtime version
- **WHEN** a native dependency, plugin, permission, or the Expo/RN version changes
- **THEN** the computed fingerprint changes
- **AND** updates published before the new build are NOT delivered to the old APK

#### Scenario: Pure-JS change keeps the same runtime version
- **WHEN** only JS files or pure-JS dependencies change
- **THEN** the fingerprint is unchanged
- **AND** the update is delivered to the existing APK over the air

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
