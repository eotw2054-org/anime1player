## ADDED Requirements

### Requirement: Selecting an anime switches the player to it

When a user opens/selects an anime from the catalog, the player SHALL switch to that anime regardless of whether it has playback history. It MUST NOT keep playing the previously selected anime.

#### Scenario: Selected anime has playback history

- **WHEN** the user taps an anime that has a saved playback record
- **THEN** the player loads that saved episode and resumes from the saved time

#### Scenario: Selected anime never played

- **WHEN** the user taps an anime with no saved playback record
- **THEN** the player starts playing the first episode URL the source provides (`buildChapters[0]` when the episode count is known, otherwise the first fetched episode, falling back to `latestUrl`) from 0
- **AND** it does NOT keep playing the previously selected anime
- **AND** there is no requirement that this be literally "episode 1" — the first URL the source returns is acceptable
