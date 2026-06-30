import { type MutableRefObject, type ReactNode } from 'react';
import { type GestureResponderHandlers, Pressable, Text, View } from 'react-native';
import { type Anime } from '../lib/anime1';
import { fmtTime } from '../lib/format';
import { isStale, livePosition, progressPct } from '../lib/remoteProgress';
import { s } from '../styles';

// 遙控器面板（手機）：顯示投影機 now-playing + 進度條，送 cmd 控制。純展示 + 回呼。
export default function RemotePanel(props: {
  remoteState: any;
  remotePlayers: any[];
  targetId: string | null;
  setTargetId: (id: string) => void;
  syncUser: string | null;
  titleAnime: Anime | null;
  roleToggle: ReactNode;
  onRescan: () => void;
  remoteLocked: boolean;
  onToggleLock: () => void;
  rsDrag: number | null;
  rsBarWRef: MutableRefObject<number>;
  rsPanHandlers: GestureResponderHandlers;
  rcmd: (action: string, value?: any) => void;
  focusProps: (id: string) => any;
  focused: (id: string) => any;
  tick: unknown; // 每 0.5s 變一次，迫使重算進度
}) {
  const {
    remoteState: st,
    remotePlayers,
    targetId,
    setTargetId,
    syncUser,
    titleAnime,
    roleToggle,
    onRescan,
    remoteLocked,
    onToggleLock,
    rsDrag,
    rsBarWRef,
    rsPanHandlers,
    rcmd,
    focusProps,
    focused,
    tick,
  } = props;
  void tick;
  const now = Date.now();
  const stale = isStale(st, now);
  const dur = st?.duration || 0;
  const live = livePosition(st, now);
  const pos = rsDrag != null && rsBarWRef.current > 0 ? (rsDrag / rsBarWRef.current) * dur : live;
  const pct = progressPct(pos, dur);
  const target = remotePlayers.find((p) => p.deviceId === targetId);

  return (
    <View style={s.remotePanel}>
      {!syncUser ? (
        <View style={s.remoteCenter}>
          {!titleAnime && roleToggle}
          <Text style={s.remoteHint}>請先登入雲端同步（撳右上角 ☁）</Text>
        </View>
      ) : remotePlayers.length === 0 ? (
        <View style={s.remoteCenter}>
          {!titleAnime && roleToggle}
          <Text style={s.remoteHint}>未連接到播放器</Text>
          <Text style={s.remoteSub}>喺另一部裝置開 App、設為「播放器」、登入同一帳戶</Text>
          <Pressable {...focusProps('rc-rescan')} style={[s.syncBtn, focused('rc-rescan')]} onPress={onRescan}>
            <Text style={s.syncBtnText}>🔄 重新搜尋</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/* 第一行：device(左) / 片名(中) / 全屏幕(右) */}
          <View style={s.rcTopRow}>
            {remotePlayers.length > 1 ? (
              <Pressable
                {...focusProps('rc-target')}
                style={[s.rcTarget, focused('rc-target')]}
                onPress={() => {
                  const i = remotePlayers.findIndex((p) => p.deviceId === targetId);
                  setTargetId(remotePlayers[(i + 1) % remotePlayers.length].deviceId);
                }}>
                <Text style={s.rcTargetText} numberOfLines={1}>🖥 {target?.name ?? '揀'} ▾</Text>
              </Pressable>
            ) : (
              <Text style={s.rcTargetStatic} numberOfLines={1}>🖥 {target?.name ?? remotePlayers[0]?.name}</Text>
            )}
            <Text style={s.rcNow} numberOfLines={1}>
              {stale ? '連線中斷…' : st ? `${st.title ?? ''}${st.ep ? ' · 第 ' + st.ep + ' 集' : ''}` : '（未播放）'}
            </Text>
            <Pressable {...focusProps('rc-fs')} style={[s.rcFsBtn, focused('rc-fs')]} onPress={() => rcmd('fs', true)}>
              <Text style={s.rcFsText}>⛶ 全屏幕</Text>
            </Pressable>
          </View>
          <View style={s.rcSeekRow} {...rsPanHandlers}>
            <View
              style={s.rcSeekWrap}
              onLayout={(e) => {
                rsBarWRef.current = e.nativeEvent.layout.width;
              }}>
              <View style={s.seekTrack} pointerEvents="none" />
              <View style={[s.seekFill, { width: `${pct * 100}%` }]} pointerEvents="none" />
            </View>
          </View>
          <Text style={s.rcTime}>
            {fmtTime(pos)} / {fmtTime(dur)}
          </Text>
          {/* transport：五個一行 */}
          <View style={s.rcRow}>
            <Pressable {...focusProps('rc-prev')} disabled={!st?.hasPrev} style={[s.ctrBtn, focused('rc-prev')]} onPress={() => rcmd('prev')}>
              <Text style={[s.rcBtnIcon, !st?.hasPrev && s.rcBtnOff]}>⏮</Text>
            </Pressable>
            <Pressable {...focusProps('rc-b10')} style={[s.ctrBtn, focused('rc-b10')]} onPress={() => rcmd('seek', -10)}>
              <Text style={s.rcBtnSm}>⟲10</Text>
            </Pressable>
            <Pressable {...focusProps('rc-play')} hasTVPreferredFocus style={[s.ctrBtn, s.rcPlay, focused('rc-play')]} onPress={() => rcmd('toggle')}>
              <Text style={s.rcBtnIcon}>{st?.playing ? '⏸' : '▶'}</Text>
            </Pressable>
            <Pressable {...focusProps('rc-f10')} style={[s.ctrBtn, focused('rc-f10')]} onPress={() => rcmd('seek', 10)}>
              <Text style={s.rcBtnSm}>⟳10</Text>
            </Pressable>
            <Pressable {...focusProps('rc-next')} disabled={!st?.hasNext} style={[s.ctrBtn, focused('rc-next')]} onPress={() => rcmd('next')}>
              <Text style={[s.rcBtnIcon, !st?.hasNext && s.rcBtnOff]}>⏭</Text>
            </Pressable>
          </View>
          {/* 設開始 [✕] / 🔒鎖定 / [✕] 設結束 */}
          <View style={s.rcMarkRow}>
            <View style={s.rcMarkGroup}>
              <Pressable {...focusProps('rc-setstart')} style={[s.rcMarkBtn, focused('rc-setstart')]} onPress={() => rcmd('setStart')}>
                <Text style={s.rcMarkText}>⏱ 設開始</Text>
              </Pressable>
              <Pressable {...focusProps('rc-clearstart')} style={[s.rcClearBtn, focused('rc-clearstart')]} onPress={() => rcmd('clearStart')}>
                <Text style={s.rcClearText}>✕</Text>
              </Pressable>
            </View>
            <Pressable
              {...focusProps('rc-lock')}
              style={[s.rcLockBtn, remoteLocked && s.rcLockOn, focused('rc-lock')]}
              onPress={onToggleLock}>
              <Text style={[s.rcLockText, remoteLocked && s.rcLockTextOn]}>{remoteLocked ? '🔒' : '🔓'}</Text>
            </Pressable>
            <View style={s.rcMarkGroup}>
              <Pressable {...focusProps('rc-clearend')} style={[s.rcClearBtn, focused('rc-clearend')]} onPress={() => rcmd('clearEnd')}>
                <Text style={s.rcClearText}>✕</Text>
              </Pressable>
              <Pressable {...focusProps('rc-setend')} style={[s.rcMarkBtn, focused('rc-setend')]} onPress={() => rcmd('setEnd')}>
                <Text style={s.rcMarkText}>⏱ 設結束</Text>
              </Pressable>
            </View>
          </View>
          {remoteLocked && <Text style={s.rcLockHint}>🔒 已鎖定 · 唔會控制播放器（防誤觸）</Text>}
        </>
      )}
    </View>
  );
}
