## ADDED Requirements

### Requirement: gimy 直連 m3u8 線路啟用廣告偵測

`maccms` provider MUST 提供 `adDetector`,重用 `lib/adskip` 嘅 `getAdRanges`,令 gimy 家族直連 m3u8 線路可被播放器自動跳廣告。`adDetector` MUST 收播放用嘅同一組 `headers`(`Referer` + `User-Agent`)去 fetch playlist。

#### Scenario: modu stitched-ad 線路偵測到廣告
- **WHEN** 一條 gimy 線路嘅 media playlist 包含來自唔同 path-id 嘅連續段(例:正片 `/…/6aJSbktn/1105kb/…`,廣告 `/…/Qdb2NZnp/10155kb/…`,前後有 `#EXT-X-DISCONTINUITY`)
- **THEN** `adDetector` 回傳一個或多個 `AdRange`,每個 `start`/`end` 對應廣告段時間,正片段唔會被包含

#### Scenario: 無 stitched 廣告嘅線路回空
- **WHEN** playlist 只得單一 content path-id、無外來段(例:xluuss 線路)
- **THEN** `adDetector` 回傳 `[]`,唔會誤標正片為廣告

#### Scenario: playlist fetch 失敗唔影響播放
- **WHEN** m3u8 fetch 失敗(403 地區限制 / 網絡錯誤 / 非 m3u8 內容)
- **THEN** `adDetector` 吞錯並回傳 `[]`,播放照常進行

### Requirement: 廣告偵測行為由真實 playlist fixture 鎖住

Repo MUST 有 unit test,用真實抽取嘅 media playlist fixture 對 `detectAdRanges` 斷言,防止未來 regression。

#### Scenario: 有廣告 fixture
- **WHEN** 對「有 stitched 廣告」嘅 modu fixture 跑 `detectAdRanges`
- **THEN** 回傳多個 `AdRange`(對應每個廣告位),且總廣告時長 > 0

#### Scenario: 無廣告 fixture
- **WHEN** 對「無 stitched 廣告」嘅 fixture 跑 `detectAdRanges`
- **THEN** 回傳 `[]`
