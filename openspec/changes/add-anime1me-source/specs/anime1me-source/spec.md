## ADDED Requirements

### Requirement: anime1.me catalog loads from animelist.json

The anime1.me provider's `loadCatalog()` SHALL fetch `https://anime1.me/animelist.json` and map each row `[catId, name, episodeText, year, season, subgroup]` into an `Anime`, with `site = "https://anime1.me"`, `slug` derived from `catId` (e.g. `cat=<catId>`), and the episode-count / year fields populated from the row. It MUST NOT depend on parsing the rendered HTML table (which is empty on initial load).

#### Scenario: Catalog maps JSON rows to Anime

- **WHEN** `loadCatalog()` is called and `animelist.json` returns rows
- **THEN** each non-adult row becomes an `Anime` whose `site` is `https://anime1.me` and whose identity encodes the row's `catId`
- **AND** the anime's episode URL base resolves to `https://anime1.me/?cat=<catId>`

#### Scenario: Catalog fetch failure surfaces like existing sources

- **WHEN** the `animelist.json` fetch fails
- **THEN** `loadCatalog()` rejects (or returns empty) so the existing list-error / cache-fallback handling in `App.tsx` applies, unchanged

### Requirement: Adult (18+) titles are filtered out at the catalog layer

`loadCatalog()` SHALL exclude adult titles, detected by `catId === 0` (these rows link to `anime1.pw`). The filter MUST use this signal, NOT a hardcoded count, because the number of adult titles changes over time.

#### Scenario: Adult rows are dropped

- **WHEN** `animelist.json` contains rows with `catId === 0`
- **THEN** those rows are excluded from the returned catalog
- **AND** no anime linking to `anime1.pw` appears in the list

#### Scenario: Count is not hardcoded

- **WHEN** the number of adult rows changes (e.g. from 18 to 19)
- **THEN** the filter still removes exactly the `catId === 0` rows with no code change

### Requirement: Episodes are read from the category page articles

`getEpisodes(anime)` SHALL fetch the anime's category page `https://anime1.me/?cat=<catId>`, collect each episode post (`<article id="post-N">`), follow pagination to gather all episodes, and return a single `PlayLine` whose episodes are ordered. Episode URLs MUST NOT be computed via the mirror `slug-10NNN000` scheme.

#### Scenario: Single line with all episodes

- **WHEN** `getEpisodes` is called for an anime1.me title spanning multiple pages
- **THEN** it returns exactly one `PlayLine`
- **AND** that line contains every episode across all category-page pages

### Requirement: Streams resolve via the data-apireq player API

`getEpisode(url)` SHALL extract the episode post's `data-apireq` payload to build stream candidate(s) plus prev/next, and `resolveStream(embed)` SHALL call the anime1.me player API to obtain a directly playable `.m3u8` / `.mp4` URL (or `null`). It MUST NOT assume the mirror's `iframe.vframe` / `.play-select` DOM.

#### Scenario: Episode resolves to a playable URL

- **WHEN** an anime1.me episode is resolved
- **THEN** `resolveStream` returns a direct media URL playable by `expo-video`

#### Scenario: Unresolvable episode yields null

- **WHEN** the player API returns no usable media URL
- **THEN** `resolveStream` returns `null` and the existing "無法解析此來源" handling applies

### Requirement: anime1.me resolves to its provider via the registry

The registry SHALL register the anime1.me provider and resolve any anime with `site === "https://anime1.me"` (and the `https://anime1.me` catalog site) to it, leaving `.in/.one/.cc` resolving to the existing anime1 provider.

#### Scenario: anime1.me title resolves to anime1me provider

- **WHEN** `getProvider(anime)` is called with `anime.site === "https://anime1.me"`
- **THEN** it returns the anime1me provider (`id === "anime1me"`)

#### Scenario: Mirror titles still resolve to the original provider

- **WHEN** `getProvider(anime)` is called with an `.in/.one/.cc` site
- **THEN** it returns the original anime1 provider (`id === "anime1"`)

### Requirement: Ad detection is shared with the existing anicdn logic

The anime1.me provider SHALL reuse the existing `getAdRanges` ad detection as its `adDetector`, since anime1.me serves media from the same anicdn with the same server-side stitching.

#### Scenario: anime1.me uses shared ad detection

- **WHEN** an anime1.me stream resolves to an `.m3u8`
- **THEN** the play path calls the provider's `adDetector`
- **AND** the detected ranges match what `getAdRanges` produces for that playlist
