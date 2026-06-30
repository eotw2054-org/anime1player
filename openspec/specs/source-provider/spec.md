# source-provider Specification

## Purpose
TBD - created by archiving change source-provider-architecture. Update Purpose after archive.
## Requirements
### Requirement: Content sources are accessed through a SourceProvider contract

All content-source operations (catalog, episodes, per-episode stream candidates, and final stream resolution) SHALL be exposed through a single `SourceProvider` interface defined in `lib/sources/types.ts`. UI / screen files (`App.tsx`) MUST NOT import concrete source modules (e.g. `lib/anime1.ts`) directly; they MUST go through a provider obtained from the registry.

#### Scenario: App loads a catalog through a provider

- **WHEN** the app loads the anime list
- **THEN** it calls `provider.loadCatalog()` (not `parseHomeList` directly)
- **AND** the resulting list is identical in content to the pre-refactor anime1 list

#### Scenario: App has no direct dependency on a concrete source

- **WHEN** `App.tsx` needs episodes, per-episode players, or a playable URL
- **THEN** it calls `getEpisodes` / `getEpisode` / `resolveStream` on a `SourceProvider`
- **AND** it does not import `parseEpisode`, `buildChapters`, or `resolveSource` from `lib/anime1.ts`

### Requirement: A registry resolves an anime to its provider

A registry (`lib/sources/registry.ts`) SHALL map a known set of provider ids to provider instances and expose `getProvider(anime)` that returns the provider responsible for that anime. When no provider matches, it SHALL fall back to the anime1 provider (currently the only source).

#### Scenario: anime1 title resolves to the anime1 provider

- **WHEN** `getProvider(anime)` is called with an anime whose `site` is an anime1 mirror domain
- **THEN** it returns the anime1 provider

#### Scenario: Unknown source falls back

- **WHEN** `getProvider(anime)` is called with an anime that matches no registered provider
- **THEN** it returns the anime1 provider (no crash)

### Requirement: Episodes are returned as one or more play-lines

`getEpisodes(anime)` SHALL return an array of play-lines (`PlayLine[]`), where each line has a label and its own ordered episode list. A source with a single line (anime1) SHALL return exactly one line. This separates title-level lines (gimy 線路) from episode-level player variants.

#### Scenario: anime1 returns a single line

- **WHEN** `getEpisodes` is called for an anime1 title
- **THEN** it returns exactly one `PlayLine`
- **AND** that line's episodes equal the chapters the pre-refactor code produced (fast path when episode count is known, otherwise the detail-page fetch, falling back to `latestUrl`)

#### Scenario: UI consumes the first line unchanged

- **WHEN** the UI renders the episode grid after the refactor
- **THEN** it uses the first play-line's episodes
- **AND** the displayed episodes are identical to pre-refactor behavior

### Requirement: A provider resolves a stream to a directly playable URL

`resolveStream(embedUrl)` SHALL return a directly playable `.m3u8` / `.mp4` URL, or `null` when it cannot resolve one, because the player (`expo-video`) accepts only direct media URLs and has no WebView fallback. The provider is responsible for drilling through any intermediate player pages.

#### Scenario: Resolvable embed yields a media URL

- **WHEN** `resolveStream` is given an anime1 embed URL that the pre-refactor `resolveSource` could resolve
- **THEN** it returns the same direct media URL

#### Scenario: Unresolvable embed yields null

- **WHEN** `resolveStream` cannot find a playable URL
- **THEN** it returns `null`
- **AND** the caller surfaces the existing "無法解析此來源" handling unchanged

### Requirement: Ad detection is an optional, source-specific provider capability

Ad detection SHALL be exposed as an optional `adDetector` method on `SourceProvider`, because it depends on a source's CDN/stitching format. The play path SHALL call `adDetector` only when the resolving provider implements it; when a provider omits it, no ad ranges are produced and no skipping occurs.

#### Scenario: anime1 detects ads as before

- **WHEN** an anime1 stream resolves to an `.m3u8`
- **THEN** the play path calls the anime1 provider's `adDetector` with the same URL and headers as the pre-refactor `getAdRanges` call
- **AND** the detected ad ranges are identical to pre-refactor behavior

#### Scenario: A provider without ad detection skips nothing

- **WHEN** the resolving provider does not implement `adDetector`
- **THEN** the play path produces an empty ad-range list
- **AND** it never auto-skips any portion of the stream

