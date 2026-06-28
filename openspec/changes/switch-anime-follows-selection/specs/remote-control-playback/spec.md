## MODIFIED Requirements

### Requirement: Remote commands control the player over WebSocket
A device in 遙控器 role SHALL send playback commands over the SyncHub WebSocket; the targeted 播放器 device SHALL execute them within ~1s. Selecting an anime (the whole catalog item) in remote role SHALL also drive the target player, not only tapping an individual episode.

#### Scenario: Transport control
- **WHEN** the remote sends toggle / next / prev / seek±10 / fullscreen
- **THEN** only the player whose deviceId equals the command's targetId performs play-pause / next-episode / prev-episode / seek / fullscreen

#### Scenario: Browse on phone, play on projector
- **WHEN** in remote role the user taps an anime or an episode in the list
- **THEN** a playEpisode command carrying the FULL `Anime` object plus the episode `url` is sent to the target player, which opens that episode (via `remotePlay`) and goes fullscreen — and the phone does NOT play it locally

#### Scenario: Selecting an anime in remote role switches the target's episode
- **WHEN** in remote role the user taps a whole anime (catalog item, not an episode)
- **THEN** a playEpisode command is sent for the saved episode if that anime has history, otherwise the first episode URL the source provides
- **AND** the command carries NO `resumeAt`; the target player starts from 0 (or its 片頭 Start marker)

#### Scenario: No target selected in remote role
- **WHEN** in remote role the user selects an anime but no target player is locked in (`targetId == null`, e.g. zero or multiple players connected)
- **THEN** no command is broadcast (a null targetId would otherwise be executed by every connected player); the remote no-ops

#### Scenario: Remote does not control itself
- **WHEN** the remote sends a command
- **THEN** every relayed message carries `from:deviceId`; the DO excludes the sender by deviceId and the client ignores any message whose `from` equals its own deviceId

#### Scenario: Both devices logged in required
- **WHEN** a device is not logged in to cloud sync
- **THEN** the remote panel shows a "請先登入" state distinct from "未連接到播放器"
