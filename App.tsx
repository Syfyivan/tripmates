import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type EntryKind = 'idea' | 'guide' | 'plan' | 'memory';

type Entry = {
  id: string;
  kind: EntryKind;
  title: string;
  note: string;
  tag: string;
  author: string;
  meta: string;
};

const tabs: Array<{ key: EntryKind; label: string }> = [
  { key: 'idea', label: '灵感' },
  { key: 'guide', label: '攻略' },
  { key: 'plan', label: '行程' },
  { key: 'memory', label: '回忆' },
];

const tags = ['吃喝', '景点', '住宿', '交通', '预算', '高光'];

const seedEntries: Entry[] = [
  {
    id: 'idea-1',
    kind: 'idea',
    title: '岚山清晨散步',
    note: '把竹林、渡月桥和一家咖啡店放在同一条慢路线里，避开中午人流。',
    tag: '景点',
    author: 'Ivan',
    meta: '京都 · 备选',
  },
  {
    id: 'guide-1',
    kind: 'guide',
    title: '关西机场到京都',
    note: 'Haruka 适合直达京都站，提前看 ICOCA 套票和末班车时间。',
    tag: '交通',
    author: 'Mia',
    meta: '已核对',
  },
  {
    id: 'plan-1',
    kind: 'plan',
    title: 'Day 2 京都东山',
    note: '清水寺、二年坂、祇园连成半日线，下午留给鸭川和随机小店。',
    tag: '景点',
    author: 'Ivan',
    meta: '第 2 天',
  },
  {
    id: 'memory-1',
    kind: 'memory',
    title: '今日高光',
    note: '大家一致同意：雨后街灯下的鸭川，比攻略照片还好看。',
    tag: '高光',
    author: '小队',
    meta: '旅行后整理',
  },
];

const kindLabels: Record<EntryKind, string> = {
  idea: '灵感',
  guide: '攻略',
  plan: '行程',
  memory: '回忆',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<EntryKind>('idea');
  const [entries, setEntries] = useState(seedEntries);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftNote, setDraftNote] = useState('');
  const [draftTag, setDraftTag] = useState(tags[0]);

  const activeEntries = useMemo(
    () => entries.filter((entry) => entry.kind === activeTab),
    [activeTab, entries],
  );

  const counts = useMemo(
    () =>
      tabs.reduce(
        (memo, tab) => ({
          ...memo,
          [tab.key]: entries.filter((entry) => entry.kind === tab.key).length,
        }),
        {} as Record<EntryKind, number>,
      ),
    [entries],
  );

  function addEntry() {
    const title = draftTitle.trim();
    const note = draftNote.trim();

    if (!title || !note) {
      return;
    }

    setEntries((current) => [
      {
        id: `${activeTab}-${Date.now()}`,
        kind: activeTab,
        title,
        note,
        tag: draftTag,
        author: '我',
        meta: '刚刚添加',
      },
      ...current,
    ]);
    setDraftTitle('');
    setDraftNote('');
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.screen} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>Tripmates</Text>
            <Text style={styles.title}>关西小队旅行库</Text>
          </View>
          <View style={styles.shareBadge}>
            <Text style={styles.shareBadgeText}>4 人</Text>
          </View>
        </View>

        <View style={styles.tripPanel}>
          <View style={styles.tripSummary}>
            <Text style={styles.tripDate}>2026 春 · 京都 / 大阪 / 奈良</Text>
            <Text style={styles.tripHeadline}>把想去的地方、确认过的信息和路上的瞬间放在一起。</Text>
          </View>
          <View style={styles.statsRow}>
            <Stat label="灵感" value={counts.idea} tone="mint" />
            <Stat label="攻略" value={counts.guide} tone="sky" />
            <Stat label="行程" value={counts.plan} tone="amber" />
            <Stat label="回忆" value={counts.memory} tone="rose" />
          </View>
        </View>

        <View style={styles.segmentedControl}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;

            return (
              <Pressable
                key={tab.key}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                onPress={() => setActiveTab(tab.key)}
                style={[styles.segmentButton, isActive && styles.segmentButtonActive]}
              >
                <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.composer}>
          <Text style={styles.sectionLabel}>添加到{kindLabels[activeTab]}</Text>
          <TextInput
            value={draftTitle}
            onChangeText={setDraftTitle}
            placeholder="标题"
            placeholderTextColor="#8a94a6"
            style={styles.input}
          />
          <TextInput
            value={draftNote}
            onChangeText={setDraftNote}
            placeholder="记录一点细节"
            placeholderTextColor="#8a94a6"
            multiline
            style={[styles.input, styles.noteInput]}
          />
          <View style={styles.tagRow}>
            {tags.map((tag) => {
              const isActive = draftTag === tag;

              return (
                <Pressable
                  key={tag}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  onPress={() => setDraftTag(tag)}
                  style={[styles.tagChip, isActive && styles.tagChipActive]}
                >
                  <Text style={[styles.tagText, isActive && styles.tagTextActive]}>{tag}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={addEntry}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
          >
            <Text style={styles.primaryButtonText}>添加</Text>
          </Pressable>
        </View>

        <View style={styles.listHeader}>
          <Text style={styles.sectionTitle}>{kindLabels[activeTab]}</Text>
          <Text style={styles.sectionCount}>{activeEntries.length} 条</Text>
        </View>

        <View style={styles.entryList}>
          {activeEntries.map((entry) => (
            <View key={entry.id} style={styles.entryCard}>
              <View style={styles.entryTopRow}>
                <View style={styles.entryTag}>
                  <Text style={styles.entryTagText}>{entry.tag}</Text>
                </View>
                <Text style={styles.entryMeta}>{entry.meta}</Text>
              </View>
              <Text style={styles.entryTitle}>{entry.title}</Text>
              <Text style={styles.entryNote}>{entry.note}</Text>
              <Text style={styles.entryAuthor}>由 {entry.author} 添加</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'mint' | 'sky' | 'amber' | 'rose' }) {
  return (
    <View style={[styles.statCard, styles[`stat${tone}`]]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f7fb',
  },
  screen: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 10,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  kicker: {
    color: '#4d6684',
    fontSize: 14,
    fontWeight: '700',
  },
  title: {
    color: '#152033',
    fontSize: 28,
    fontWeight: '800',
    marginTop: 4,
  },
  shareBadge: {
    alignItems: 'center',
    backgroundColor: '#152033',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 56,
  },
  shareBadgeText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  tripPanel: {
    backgroundColor: '#ffffff',
    borderColor: '#dfe7f1',
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  tripSummary: {
    marginBottom: 14,
  },
  tripDate: {
    color: '#647187',
    fontSize: 13,
    fontWeight: '700',
  },
  tripHeadline: {
    color: '#1f2d3f',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 25,
    marginTop: 6,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statCard: {
    borderRadius: 8,
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  statmint: {
    backgroundColor: '#dff6ee',
  },
  statsky: {
    backgroundColor: '#e1eefc',
  },
  statamber: {
    backgroundColor: '#fff0c9',
  },
  statrose: {
    backgroundColor: '#fde5e2',
  },
  statValue: {
    color: '#152033',
    fontSize: 22,
    fontWeight: '900',
  },
  statLabel: {
    color: '#526071',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  segmentedControl: {
    backgroundColor: '#e7edf5',
    borderRadius: 8,
    flexDirection: 'row',
    marginTop: 18,
    padding: 4,
  },
  segmentButton: {
    alignItems: 'center',
    borderRadius: 7,
    flex: 1,
    minHeight: 40,
    justifyContent: 'center',
  },
  segmentButtonActive: {
    backgroundColor: '#ffffff',
  },
  segmentText: {
    color: '#526071',
    fontSize: 14,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: '#152033',
  },
  composer: {
    backgroundColor: '#ffffff',
    borderColor: '#dfe7f1',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 18,
    padding: 16,
  },
  sectionLabel: {
    color: '#32445b',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#f6f8fb',
    borderColor: '#dbe3ee',
    borderRadius: 8,
    borderWidth: 1,
    color: '#172235',
    fontSize: 16,
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noteInput: {
    marginTop: 10,
    minHeight: 88,
    textAlignVertical: 'top',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  tagChip: {
    backgroundColor: '#f0f3f8',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tagChipActive: {
    backgroundColor: '#0f766e',
  },
  tagText: {
    color: '#526071',
    fontSize: 13,
    fontWeight: '700',
  },
  tagTextActive: {
    color: '#ffffff',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#152033',
    borderRadius: 8,
    justifyContent: 'center',
    marginTop: 14,
    minHeight: 48,
  },
  primaryButtonPressed: {
    backgroundColor: '#243247',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  listHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 22,
  },
  sectionTitle: {
    color: '#152033',
    fontSize: 20,
    fontWeight: '900',
  },
  sectionCount: {
    color: '#647187',
    fontSize: 13,
    fontWeight: '700',
  },
  entryList: {
    gap: 12,
    marginTop: 12,
  },
  entryCard: {
    backgroundColor: '#ffffff',
    borderColor: '#dfe7f1',
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  entryTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  entryTag: {
    backgroundColor: '#eef7f6',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  entryTagText: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '800',
  },
  entryMeta: {
    color: '#7a8597',
    fontSize: 12,
    fontWeight: '700',
  },
  entryTitle: {
    color: '#172235',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 24,
    marginTop: 12,
  },
  entryNote: {
    color: '#48576b',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
  entryAuthor: {
    color: '#8792a3',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 12,
  },
});
