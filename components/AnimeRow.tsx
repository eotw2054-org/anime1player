import { Pressable, Text, View } from 'react-native';
import { type Anime, SITES } from '../lib/anime1';
import { favKey } from '../lib/format';
import { type SiteKey } from '../lib/types';
import { s } from '../styles';

// 側欄清單一行：片名 + 集數/更新/來源站 + 心心收藏。純展示 + 回呼。
export default function AnimeRow({
  item,
  fav,
  active,
  onOpen,
  onToggleFav,
  focusProps,
  focused,
}: {
  item: Anime;
  fav: boolean;
  active: boolean;
  onOpen: () => void;
  onToggleFav: () => void;
  focusProps: (id: string) => any;
  focused: (id: string) => any;
}) {
  const k = favKey(item);
  // 顯示來源站台（合併清單會混入兩站，標籤分得清）
  const siteTag = (Object.keys(SITES) as SiteKey[]).find((kk) => SITES[kk] === item.site);
  return (
    <View style={[s.row, active && s.rowActive]}>
      <Pressable
        {...focusProps('row-' + k)}
        style={[s.rowMain, focused('row-' + k) && s.rowFocused]}
        onPress={onOpen}>
        <Text style={[s.rowName, active && s.rowNameActive]} numberOfLines={1}>
          {active ? '● ' : ''}
          {item.name}
        </Text>
        <Text style={s.rowMeta} numberOfLines={1}>
          <Text style={s.rowLive}>{item.cntText}</Text> · {item.update}
          {siteTag ? <Text style={s.rowSite}>{'  ·  anime1.' + siteTag}</Text> : null}
        </Text>
      </Pressable>
      <Pressable
        {...focusProps('heart-' + k)}
        hitSlop={8}
        style={[s.heart, focused('heart-' + k)]}
        onPress={onToggleFav}>
        <Text style={[s.heartIcon, fav && s.heartOn]}>{fav ? '♥' : '♡'}</Text>
      </Pressable>
    </View>
  );
}
