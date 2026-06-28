## ADDED Requirements

### Requirement: Per-device player/remote role
Each device SHALL have a persisted role toggle [ 播放器 │ 遙控器 ] shown left of the 顯示 button. Only a device in 播放器 (player) role executes received commands; a device in 遙控器 (remote) role only sends them.

#### Scenario: Switch to remote role
- **WHEN** the user taps 遙控器 on the phone
- **THEN** the top player block is replaced by the remote-control panel
- **AND** the device stops local playback and no longer executes incoming commands

#### Scenario: Role persists
- **WHEN** the app restarts
- **THEN** the device keeps its previously selected role

### Requirement: Remote commands control the player over WebSocket
A device in 遙控器 role SHALL send playback commands over the SyncHub WebSocket; the targeted 播放器 device SHALL execute them within ~1s.

#### Scenario: Transport control
- **WHEN** the remote sends toggle / next / prev / seek±10 / fullscreen
- **THEN** only the player whose deviceId equals the command's targetId performs play-pause / next-episode / prev-episode / seek / fullscreen

#### Scenario: Browse on phone, play on projector
- **WHEN** in remote role the user taps an anime/episode in the list
- **THEN** a playEpisode command (url + anime) is sent to the target player, which opens that episode and goes fullscreen — and the phone does NOT play it locally

#### Scenario: Remote does not control itself
- **WHEN** the remote sends a command
- **THEN** the relay delivers it only to other devices, so the sending device never executes its own command

### Requirement: Now-playing + interpolated progress on the remote
The player SHALL broadcast its now-playing state on playback events and on a ~3s heartbeat; the remote SHALL show title/episode and a progress bar that advances smoothly via local interpolation.

#### Scenario: Smooth progress without flooding
- **WHEN** the player is playing
- **THEN** it broadcasts position roughly every 3s (plus on play/pause/seek/episode-change)
- **AND** the remote interpolates locally so the bar moves each ~0.5s without a message per tick

#### Scenario: Drag to seek
- **WHEN** the user drags the remote's progress bar and releases
- **THEN** one seekTo command is sent; the bar optimistically jumps and reconciles on the next state update

### Requirement: Target selection among multiple players
When more than one player is connected, the remote SHALL let the user pick which player to control; with exactly one player it SHALL auto-select it.

#### Scenario: Single player auto-target
- **WHEN** exactly one 播放器 device is connected
- **THEN** the remote targets it automatically and shows its name (no picker)

#### Scenario: Multiple players
- **WHEN** two or more players are connected
- **THEN** the remote shows a picker; commands carry the chosen targetId; offline devices are shown but not selectable

### Requirement: Connection state feedback
The remote SHALL clearly indicate when no player is reachable and SHALL not silently drop commands.

#### Scenario: No player connected
- **WHEN** no 播放器 device is connected
- **THEN** the remote shows「未連接到播放器」with guidance and a retry action

#### Scenario: Target goes offline
- **WHEN** the selected player disconnects mid-session
- **THEN** the remote surfaces an error / returns to the not-connected state instead of silently doing nothing

### Requirement: Device identity
Each device SHALL have a persistent id and an auto-generated name that is renameable in settings.

#### Scenario: Auto name
- **WHEN** a device first connects
- **THEN** it announces a stable deviceId and a default name (e.g. `Android-A1B2`) usable in the target picker

### Requirement: Free-tier and OTA constraints
The feature SHALL run within Cloudflare free tier (SQLite-backed Durable Object + WebSocket hibernation, no extra storage) and ship to clients via the self-hosted OTA; no new native module.

#### Scenario: No paid resources
- **WHEN** the feature is deployed
- **THEN** it uses only the existing SyncHub Worker/DO over WebSocket and adds no R2/paid binding
