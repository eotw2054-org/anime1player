## 1. Styles

- [x] 1.1 喺 `App.tsx` 嘅 `StyleSheet.create` 加 `fsTopBar`：`position:'absolute'`, `top:44`, `left:0`, `right:0`, `alignItems:'center'`
- [x] 1.2 加 `fsTopName`：白色、`fontSize:17`、`fontWeight:'800'`、`maxWidth:'70%'`、深色 `textShadow`
- [x] 1.3 加 `fsTopEp`：淡白色（約 0.75 opacity）、`fontSize:13`、`fontWeight:'700'`、`marginTop:2`、深色 `textShadow`

## 2. Overlay JSX

- [x] 2.1 喺 `PlayerOverlay` 嘅 `{ctrlShown && ( … )}` 區塊頂部，加 `fullscreen && current` 條件包住嘅資訊條 `View`（`style={s.fsTopBar}`、`pointerEvents="none"`）
- [x] 2.2 第一行 `Text`（`style={s.fsTopName}`、`numberOfLines={1}`）顯示 `★ {current.anime.name} ★`
- [x] 2.3 第二行 `Text`（`style={s.fsTopEp}`）顯示 `第 {current.episodeNo} 集`

## 3. Verify

- [x] 3.1 全螢幕 + 控制項顯示時：頂部置中見到兩行片名／集數
- [x] 3.2 收起控制項（`ctrlShown` 為假）時：資訊條一同消失
- [x] 3.3 非全螢幕：唔顯示資訊條，原 `titleBar` 行為不變
- [x] 3.4 長動畫名：單行截斷、唔疊到右上角退出全螢幕掣
- [x] 3.5 遙控器操作：焦點正常落喺控制掣，資訊條唔搶焦點
