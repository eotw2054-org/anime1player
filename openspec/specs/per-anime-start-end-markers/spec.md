# per-anime-start-end-markers Specification

## Purpose
TBD - created by archiving change per-anime-start-end-markers. Update Purpose after archive.
## Requirements
### Requirement: Set Start marker from the overlay
The player overlay SHALL provide a "設開頭" (Set Start) control that, when pressed, records the current playback position as the Start marker for the currently playing anime, identified by `site|slug`.

#### Scenario: Record Start at current time
- **WHEN** an anime is playing and the user presses "設開頭" at 12 seconds
- **THEN** the Start marker for that anime is set to 12 seconds
- **AND** the control displays the recorded value (e.g. "開頭 0:12")

#### Scenario: Overwrite an existing Start
- **WHEN** a Start marker already exists and the user presses "設開頭" at a new position
- **THEN** the Start marker is replaced with the new current position

### Requirement: Set End marker from the overlay
The player overlay SHALL provide a "設結尾" (Set End) control that, when pressed, records the current playback position as the End marker for the currently playing anime.

#### Scenario: Record End at current time
- **WHEN** an anime is playing and the user presses "設結尾" at 21 minutes 30 seconds
- **THEN** the End marker for that anime is set to 1290 seconds
- **AND** the control displays the recorded value (e.g. "結尾 21:30")

#### Scenario: Overwrite an existing End
- **WHEN** an End marker already exists and the user presses "設結尾" at a new position
- **THEN** the End marker is replaced with the new current position

### Requirement: Markers settable only with a loaded anime
The Set controls SHALL only record a marker when an anime is currently loaded and the playback position is a finite number; otherwise the controls SHALL be inert.

#### Scenario: No anime loaded
- **WHEN** no anime is playing (current is null) and the user presses a Set control
- **THEN** no marker is recorded and no error occurs

### Requirement: Unset markers display a placeholder
A Set control with no recorded value SHALL display a distinct placeholder ("—"), distinguishable from a marker recorded at 0 seconds.

#### Scenario: Unset vs zero
- **WHEN** Start is unset
- **THEN** the control shows "—" (not "0:00")

### Requirement: Apply Start marker on episode load
On each episode load, when no explicit resume position applies, the player SHALL seek to the anime's Start marker before playback. The Start marker SHALL replace the former global skip behavior.

#### Scenario: Auto-skip intro on load
- **WHEN** an episode of an anime that has Start = 12s reaches `readyToPlay`
- **AND** there is no active resume/source-switch position
- **THEN** the player seeks to 12 seconds and begins playback

#### Scenario: Resume takes priority over Start
- **WHEN** the user re-opens an anime with saved progress (resume position)
- **THEN** the player seeks to the resume position, not the Start marker

#### Scenario: No Start set
- **WHEN** an episode loads for an anime with no Start marker and no resume position
- **THEN** playback begins from the beginning (0 seconds)

#### Scenario: Auto-advanced episode also applies Start
- **WHEN** the End marker auto-advances to the next episode (no resume position is set)
- **THEN** the next episode also seeks to the Start marker on load

### Requirement: Auto-advance at End marker
While playing, when the current time reaches the anime's End marker, the player SHALL automatically advance to the next episode if one exists, triggering at most once per loaded episode.

#### Scenario: Jump to next at End
- **WHEN** an anime has End = 1290s and a next episode exists
- **AND** playback time reaches 1290 seconds
- **THEN** the player loads the next episode

#### Scenario: End with no next episode
- **WHEN** playback reaches the End marker and there is no next episode
- **THEN** the player does not jump and playback continues to natural end

#### Scenario: No repeated triggering
- **WHEN** the End marker has fired for the current episode
- **THEN** it does not fire again for that same loaded episode

#### Scenario: Invalid End is ignored
- **WHEN** the End marker is less than or equal to the Start marker
- **THEN** the End marker does not trigger an auto-advance

#### Scenario: No skip-storm on load past End
- **WHEN** an episode loads already at or past the End position
- **THEN** auto-advance does not fire until playback has been observed below End during this load

#### Scenario: Continue watching after auto-advance
- **WHEN** the End marker auto-advances to the next episode
- **THEN** the saved resume position points at the next episode, not the skipped episode's end

### Requirement: Per-anime persistence of markers
Start and End markers SHALL be stored per anime, keyed by `site|slug`, and persisted across app restarts.

#### Scenario: Markers survive restart
- **WHEN** the user sets Start and End for an anime and restarts the app
- **THEN** the same Start and End values are still applied for that anime

#### Scenario: Markers are independent per anime
- **WHEN** the user sets markers on anime A
- **THEN** anime B's markers are unaffected

### Requirement: Clear markers
The overlay SHALL allow clearing each marker independently. Clearing Start reverts to playing from the beginning (or resume); clearing End reverts to advancing only at natural end of playback.

#### Scenario: Clear Start
- **WHEN** the user clears the Start marker for an anime
- **THEN** subsequent loads of that anime begin from 0 (or resume) with no intro skip

#### Scenario: Clear End
- **WHEN** the user clears the End marker for an anime
- **THEN** the anime no longer auto-advances early and only advances when playback finishes

### Requirement: Remove global skip setting
The former global "跳秒" (skip) input and setting SHALL be removed; per-anime Start replaces it.

#### Scenario: No global skip UI
- **WHEN** the user views the settings row
- **THEN** there is no global "跳秒" input field

