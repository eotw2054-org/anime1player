import { Pressable, ScrollView, Text, View } from 'react-native';
import { type Anime, SITES } from '../lib/anime1';
import { type AnimeGroup } from '../lib/catalog';
import { favKey } from '../lib/format';
import { type SiteKey } from '../lib/types';
import { s } from '../styles';

/** 來源短名:anime1 family → anime1.<k>;其他站 → 直接 key（gimyplus…）。 */
function siteShort(site: string): string {
  const k = (Object.keys(SITES) as SiteKey[]).find((kk) => SITES[kk] === site);
  if (!k) return site;
  return k.startsWith('gimy') ? k : 'anime1.' + k;
}

// 側欄清單一行：同名跨來源併成一行，片名 + 每個來源一粒可撳 chip + 心心收藏。
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
  const { primary, sources } = group;
  const hasActive = sources.some(activeOf);
  const pk = favKey(primary);
  return (
    <View style={[s.row, hasActive && s.rowActive]}>
      <View style={s.rowMain}>
        <Pressable
          {...focusProps('row-' + pk)}
          style={focused('row-' + pk) && s.rowFocused}
          onPress={() => onOpen(primary)}>
          <Text style={[s.rowName, hasActive && s.rowNameActive]} numberOfLines={1}>
            {hasActive ? '● ' : ''}
            {primary.name}
          </Text>
        </Pressable>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.rowSrcRow}
          contentContainerStyle={s.rowSrcRowContent}
          keyboardShouldPersistTaps="handled">
          {sources.map((src) => {
            const sk = favKey(src);
            const on = activeOf(src);
            return (
              <Pressable
                key={sk}
                {...focusProps('src-' + sk)}
                style={[s.rowSrcChip, on && s.rowSrcChipOn, focused('src-' + sk)]}
                onPress={() => onOpen(src)}>
                <Text style={[s.rowSrcText, on && s.rowSrcTextOn]} numberOfLines={1}>
                  {src.cntText ? src.cntText + ' · ' : ''}
                  {siteShort(src.site)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
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
