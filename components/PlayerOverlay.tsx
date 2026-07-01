import { useRef, useState } from "react";
import { PanResponder, Pressable, Text, View } from "react-native";
import { useEventListener } from "expo";
import { type Current } from "../lib/types";
import { fmtTime } from "../lib/format";
import { useStyles } from "../ui-theme";

// 自訂播放控制（取代原生控制，等疊層上/下集同播放控制一齊 show/hide）
export default function PlayerOverlay(props: {
  player: any;
  current: Current | null;
  ctrlShown: boolean;
  fullscreen: boolean;
  showControls: () => void;
  hideControls: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToggleFs: () => void;
  faved: boolean;
  onToggleFav: () => void;
  mark: { start?: number; end?: number; at?: number } | undefined;
  onSetStart: () => void;
  onSetEnd: () => void;
  onClearStart: () => void;
  onClearEnd: () => void;
  focusProps: (id: string) => any;
  focused: (id: string) => any;
}) {
  const s = useStyles();
  const {
    player, current, ctrlShown, fullscreen,
    showControls, hideControls, onPrev, onNext, onToggleFs,
    faved, onToggleFav,
    mark, onSetStart, onSetEnd, onClearStart, onClearEnd, focusProps, focused,
  } = props;
  const [pos, setPos] = useState({ t: 0, d: 0 });
  const [playing, setPlaying] = useState(true);
  const [barW, setBarW] = useState(0);
  const barWRef = useRef(0);
  const barXRef = useRef(0); // 進度條左邊喺螢幕嘅絕對 X（grant 時算）
  const [drag, setDrag] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);
  const shownRef = useRef(ctrlShown);
  shownRef.current = ctrlShown;

  useEventListener(player, 'timeUpdate', () => {
    if (!shownRef.current || dragRef.current != null) return;
    let t = 0;
    let d = 0;
    try {
      t = player.currentTime || 0;
      d = player.duration || 0;
    } catch (e) { if (__DEV__) console.warn(e); }
    setPos({ t, d });
  });
  useEventListener(player, 'playingChange', () => {
    try {
      setPlaying(player.playing);
    } catch (e) { if (__DEV__) console.warn(e); }
  });

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const w = barWRef.current;
        // 子 view 已 pointerEvents=none，grant 嘅 locationX 一定相對 seekBarWrap
        barXRef.current = e.nativeEvent.pageX - e.nativeEvent.locationX;
        const x = Math.min(w, Math.max(0, e.nativeEvent.locationX));
        dragRef.current = x;
        setDrag(x);
        showControls();
      },
      onPanResponderMove: (e, gs) => {
        const w = barWRef.current;
        // 用絕對座標減進度條左邊，唔受拖到邊個子 view 影響
        const x = Math.min(w, Math.max(0, gs.moveX - barXRef.current));
        dragRef.current = x;
        setDrag(x);
      },
      onPanResponderRelease: () => {
        const x = dragRef.current ?? 0;
        const w = barWRef.current;
        const ratio = w > 0 ? Math.min(1, Math.max(0, x / w)) : 0;
        try {
          player.currentTime = ratio * (player.duration || 0);
        } catch (e) { if (__DEV__) console.warn(e); }
        dragRef.current = null;
        setDrag(null);
        showControls();
      },
    })
  ).current;

  const d = pos.d;
  const t = drag != null && barWRef.current > 0 ? (drag / barWRef.current) * d : pos.t;
  const pct = d > 0 ? Math.min(1, Math.max(0, t / d)) : 0;
  const seekBy = (n: number) => {
    try {
      player.currentTime = Math.max(0, (player.currentTime || 0) + n);
    } catch (e) { if (__DEV__) console.warn(e); }
    showControls();
  };
  const togglePlay = () => {
    try {
      if (player.playing) player.pause();
      else player.play();
    } catch (e) { if (__DEV__) console.warn(e); }
    showControls();
  };

  return (
    <>
      {/* 感應層：收起時撳一下顯示；顯示時撳空白收起 */}
      {!ctrlShown ? (
        <Pressable focusable={!fullscreen} style={s.tapCatcher} onPress={showControls} />
      ) : (
        <Pressable focusable={false} style={s.tapCatcher} onPress={hideControls} />
      )}

      {ctrlShown && (
        <>
          {/* 全螢幕：頂部置中片名 + 集數 */}
          {fullscreen && current && (
            <View style={s.fsTopBar} pointerEvents="none">
              <Text style={s.fsTopName} numberOfLines={1}>
                ★ {current.anime.name} ★
              </Text>
              <Text style={s.fsTopEp}>第 {current.episodeNo} 集</Text>
            </View>
          )}

          {/* inline：左上角片名 + 集數 */}
          {!fullscreen && current && (
            <View style={s.inlineTop} pointerEvents="none">
              <Text style={s.inlineTopName} numberOfLines={1}>
                {current.anime.name}
              </Text>
              <Text style={s.inlineTopEp}>第 {current.episodeNo} 集</Text>
            </View>
          )}

          {/* 中央：倒退10 / 播放暫停 / 快進10 */}
          <View style={s.ctrCenter} pointerEvents="box-none">
            <Pressable
              {...focusProps('seek-back')}
              focusable={!fullscreen}
              style={[s.ctrBtn, focused('seek-back')]}
              onPress={() => seekBy(-10)}>
              <Text style={s.ctrIcon}>⟲</Text>
              <Text style={s.ctrIconSm}>10</Text>
            </Pressable>
            <Pressable
              {...focusProps('play')}
              focusable={!fullscreen}
              style={[s.ctrPlay, focused('play')]}
              onPress={togglePlay}>
              <Text style={s.ctrPlayIcon}>{playing ? 'II' : '▶'}</Text>
            </Pressable>
            <Pressable
              {...focusProps('seek-fwd')}
              focusable={!fullscreen}
              style={[s.ctrBtn, focused('seek-fwd')]}
              onPress={() => seekBy(10)}>
              <Text style={s.ctrIcon}>⟳</Text>
              <Text style={s.ctrIconSm}>10</Text>
            </Pressable>
          </View>

          {/* 邊緣：上集 / 下集 */}
          {current && (
            <>
              <Pressable
                {...focusProps('ov-prev')}
                focusable={!fullscreen}
                disabled={!current.prevUrl}
                style={[s.ovBtn, s.ovLeft, !current.prevUrl && s.ovOff, focused('ov-prev')]}
                onPress={onPrev}>
                <Text style={s.ovText}>‹{'\n'}上{'\n'}集</Text>
              </Pressable>
              <Pressable
                {...focusProps('ov-next')}
                focusable={!fullscreen}
                disabled={!current.nextUrl}
                style={[s.ovBtn, s.ovRight, !current.nextUrl && s.ovOff, focused('ov-next')]}
                onPress={onNext}>
                <Text style={s.ovText}>下{'\n'}集{'\n'}›</Text>
              </Pressable>
            </>
          )}

          {/* 全螢幕 */}
          <Pressable
            {...focusProps('fs-toggle')}
            focusable={!fullscreen}
            style={[s.fsToggle, fullscreen && s.fsToggleFs, focused('fs-toggle')]}
            onPress={onToggleFs}>
            <Text style={s.fsToggleText}>{fullscreen ? '⤢ 退出全螢幕' : '⛶ 全螢幕'}</Text>
          </Pressable>

          {/* 收藏（喺全螢幕掣下面,全螢幕/非全螢幕都有）*/}
          {current && (
            <Pressable
              {...focusProps('ov-fav')}
              focusable={!fullscreen}
              style={[s.favBtnOv, fullscreen && s.favBtnOvFs, faved && s.favBtnOvOn, focused('ov-fav')]}
              onPress={onToggleFav}>
              <Text style={s.fsToggleText}>{faved ? '♥ 已收藏' : '♡ 收藏'}</Text>
            </Pressable>
          )}

          {/* 開頭／結尾 標記（設開頭貼左、設結尾貼右）—— 可 touch + 遙控/空中滑鼠 focus */}
          {current && (
            <View style={s.markRow} pointerEvents="box-none">
              <View style={s.markGroup}>
                <Pressable {...focusProps('set-start')} style={[s.markBtn, focused('set-start')]} onPress={onSetStart}>
                  <Text style={s.markBtnText}>⏮ 設開頭 {mark?.start == null ? '—' : fmtTime(mark.start)}</Text>
                </Pressable>
                {mark?.start != null && (
                  <Pressable {...focusProps('clr-start')} style={[s.markClear, focused('clr-start')]} onPress={onClearStart}>
                    <Text style={s.markClearText}>✕</Text>
                  </Pressable>
                )}
              </View>
              <View style={s.markGroup}>
                {mark?.end != null && (
                  <Pressable {...focusProps('clr-end')} style={[s.markClear, focused('clr-end')]} onPress={onClearEnd}>
                    <Text style={s.markClearText}>✕</Text>
                  </Pressable>
                )}
                <Pressable {...focusProps('set-end')} style={[s.markBtn, focused('set-end')]} onPress={onSetEnd}>
                  <Text style={s.markBtnText}>設結尾 {mark?.end == null ? '—' : fmtTime(mark.end)} ⏭</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* 底部：時間 + 進度條（可拖） */}
          <View style={s.seekRow} pointerEvents="box-none">
            <Text style={s.timeText}>
              {fmtTime(t)} / {fmtTime(d)}
            </Text>
            <View
              style={s.seekBarWrap}
              onLayout={(e) => {
                const w = e.nativeEvent.layout.width;
                barWRef.current = w;
                setBarW(w);
              }}
              {...pan.panHandlers}>
              <View style={s.seekTrack} pointerEvents="none" />
              <View style={[s.seekFill, { width: pct * barW }]} pointerEvents="none" />
              <View style={[s.seekKnob, { left: pct * barW - 8 }]} pointerEvents="none" />
            </View>
          </View>
        </>
      )}
    </>
  );
}
