import { type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { s } from '../styles';

// 標題列：片名 + (播放中)集數 + 角色 toggle + 收起/顯示 + (打橫)最愛篩選。
// roleToggle / favFilter 由 App 以 slot 形式傳入。
export default function TitleBar({
  name,
  playingEp,
  roleToggle,
  showPanelToggle,
  panelOpen,
  onTogglePanel,
  favFilter,
  focusProps,
  focused,
}: {
  name: string;
  playingEp: string | null;
  roleToggle: ReactNode;
  showPanelToggle: boolean;
  panelOpen: boolean;
  onTogglePanel: () => void;
  favFilter: ReactNode;
  focusProps: (id: string) => any;
  focused: (id: string) => any;
}) {
  return (
    <View style={s.titleBar}>
      <Text style={s.tbName} numberOfLines={1}>
        {name}
      </Text>
      {playingEp != null && (
        <View style={s.tbEp}>
          <Text style={s.tbEpText}>第 {playingEp} 集</Text>
        </View>
      )}
      <View style={{ flex: 1 }} />
      {roleToggle}
      {showPanelToggle && (
        <Pressable
          {...focusProps('panel-toggle')}
          style={[s.panelToggle, focused('panel-toggle')]}
          onPress={onTogglePanel}>
          <Text style={s.panelToggleText}>{panelOpen ? '▴ 收起' : '▾ 顯示'}</Text>
        </Pressable>
      )}
      {favFilter}
    </View>
  );
}
