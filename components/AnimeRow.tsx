import { Pressable, Text, View } from 'react-native';
import { type Anime } from '../lib/anime1';
import { type AnimeGroup } from '../lib/catalog';
import { favKey } from '../lib/format';
import { useStyles } from '../ui-theme';

// 側欄清單一行：片名 + 狀態（集數/連載中）。來源唔喺清單顯示（騰空間）—— 撳一下用第一個來源,
// 之後喺播放器嘅「主要來源」下拉跨站切換。
export default function AnimeRow({
  group,
  fav,
  activeOf,
  onOpen,
  onToggleFav,
  focusProps,
  focused,
}: {
  group: AnimeGroup;
  fav: boolean; // 成組收藏狀態（按戲名,唔按 source）
  activeOf: (a: Anime) => boolean;
  onOpen: (a: Anime) => void;
  onToggleFav: (g: AnimeGroup) => void;
  focusProps: (id: string) => any;
  focused: (id: string) => any;
}) {
  const s = useStyles();
  const { primary, sources } = group;
  const hasActive = sources.some(activeOf);
  const pk = favKey(primary);
  return (
    <View style={[s.row, hasActive && s.rowActive]}>
      <Pressable
        {...focusProps('row-' + pk)}
        style={[s.rowMain, focused('row-' + pk) && s.rowFocused]}
        onPress={() => onOpen(primary)}>
        <Text style={[s.rowName, hasActive && s.rowNameActive]} numberOfLines={1}>
          {hasActive ? '● ' : ''}
          {primary.name}
        </Text>
        {!!primary.cntText && (
          <Text style={s.rowMeta} numberOfLines={1}>
            {primary.cntText}
          </Text>
        )}
      </Pressable>
      <Pressable
        {...focusProps('heart-' + pk)}
        hitSlop={8}
        style={[s.heart, focused('heart-' + pk)]}
        onPress={() => onToggleFav(group)}>
        <Text style={[s.heartIcon, fav && s.heartOn]}>{fav ? '♥' : '♡'}</Text>
      </Pressable>
    </View>
  );
}
