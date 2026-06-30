import { type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useStyles } from '../ui-theme';

// 標題列：主要來源 / 分流 下拉（由 App 以 controls slot 傳入）+ 角色 toggle + 收起/顯示 + (打橫)最愛篩選。
// 片名 + 集數 已移入影片畫面左上角(見 PlayerOverlay)。
export default function TitleBar({
  controls,
  roleToggle,
  showPanelToggle,
  panelOpen,
  onTogglePanel,
  favFilter,
  focusProps,
  focused,
}: {
  controls: ReactNode;
  roleToggle: ReactNode;
  showPanelToggle: boolean;
  panelOpen: boolean;
  onTogglePanel: () => void;
  favFilter: ReactNode;
  focusProps: (id: string) => any;
  focused: (id: string) => any;
}) {
  const s = useStyles();
  return (
    <View style={s.titleBar}>
      {controls}
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
