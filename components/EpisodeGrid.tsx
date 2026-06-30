import { Pressable, Text, View } from 'react-native';
import { type Chapter } from '../lib/types';
import { s } from '../styles';

// 選集格：可 wrap 嘅集數按鈕（打橫/打直共用）。純展示，靠 props 收資料 + 回呼。
export default function EpisodeGrid({
  chapters,
  currentUrl,
  itemWidth,
  onLayout,
  onPlay,
  focusProps,
  focused,
}: {
  chapters: Chapter[];
  currentUrl: string | undefined;
  itemWidth: number;
  onLayout: (w: number) => void;
  onPlay: (url: string) => void;
  focusProps: (id: string) => any;
  focused: (id: string) => any;
}) {
  return (
    <View style={s.epWrap} onLayout={(e) => onLayout(e.nativeEvent.layout.width)}>
      {chapters.map((item) => {
        const on = currentUrl === item.url;
        return (
          <Pressable
            key={item.url}
            {...focusProps('ep-' + item.url)}
            style={[s.ep, { width: itemWidth || undefined }, on && s.epOn, focused('ep-' + item.url)]}
            onPress={() => onPlay(item.url)}>
            <Text style={[s.epText, on && s.epTextOn]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {item.ep}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
