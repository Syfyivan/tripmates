import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Session } from '@supabase/supabase-js';

import { isSupabaseConfigured } from './src/config/env';
import { defaultLocalState } from './src/data/seed';
import {
  getCurrentSession,
  joinTripByInvite,
  pushActiveTrip,
  sendLoginLink,
  signOut,
  subscribeToAuthChanges,
} from './src/services/tripSync';
import { loadLocalTripState, saveLocalTripState } from './src/storage/localTripStore';
import { EntryKind, LocalTripState, TripEntry } from './src/types';

const tabs: Array<{ key: EntryKind; label: string }> = [
  { key: 'idea', label: '灵感' },
  { key: 'guide', label: '攻略' },
  { key: 'plan', label: '行程' },
  { key: 'memory', label: '回忆' },
];

const tags = ['吃喝', '景点', '住宿', '交通', '预算', '高光'];

const kindLabels: Record<EntryKind, string> = {
  idea: '灵感',
  guide: '攻略',
  plan: '行程',
  memory: '回忆',
};

const syncLabels: Record<TripEntry['syncStatus'], string> = {
  local: '本机',
  synced: '已同步',
  error: '待重试',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<EntryKind>('idea');
  const [tripState, setTripState] = useState<LocalTripState>(defaultLocalState);
  const [isHydrated, setIsHydrated] = useState(false);
  const [storageMessage, setStorageMessage] = useState('读取本地数据');
  const [session, setSession] = useState<Session | null>(null);
  const [remoteMessage, setRemoteMessage] = useState(
    isSupabaseConfigured ? 'Supabase 已准备连接' : '本地模式',
  );
  const [isRemoteBusy, setIsRemoteBusy] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftNote, setDraftNote] = useState('');
  const [draftTag, setDraftTag] = useState(tags[0]);
  const [email, setEmail] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  useEffect(() => {
    let isMounted = true;

    loadLocalTripState()
      .then((storedState) => {
        if (!isMounted) {
          return;
        }

        setTripState(storedState);
        setStorageMessage('本机已保存');
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setTripState(defaultLocalState);
        setStorageMessage('本机数据已重置');
      })
      .finally(() => {
        if (isMounted) {
          setIsHydrated(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    saveLocalTripState(tripState)
      .then(() => setStorageMessage('本机已保存'))
      .catch(() => setStorageMessage('本机保存失败'));
  }, [isHydrated, tripState]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return;
    }

    let isMounted = true;

    getCurrentSession()
      .then((currentSession) => {
        if (isMounted) {
          setSession(currentSession);
          setRemoteMessage(currentSession ? '已登录 Supabase' : '等待登录');
        }
      })
      .catch((error: Error) => {
        if (isMounted) {
          setRemoteMessage(error.message);
        }
      });

    const unsubscribe = subscribeToAuthChanges((nextSession) => {
      setSession(nextSession);
      setRemoteMessage(nextSession ? '已登录 Supabase' : '等待登录');
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const activeTrip = useMemo(
    () =>
      tripState.trips.find((trip) => trip.id === tripState.activeTripId) ??
      tripState.trips[0] ??
      defaultLocalState.trips[0],
    [tripState.activeTripId, tripState.trips],
  );

  const entriesForTrip = useMemo(
    () => tripState.entries.filter((entry) => entry.tripId === activeTrip.id),
    [activeTrip.id, tripState.entries],
  );

  const activeEntries = useMemo(
    () => entriesForTrip.filter((entry) => entry.kind === activeTab),
    [activeTab, entriesForTrip],
  );

  const counts = useMemo(
    () =>
      tabs.reduce(
        (memo, tab) => ({
          ...memo,
          [tab.key]: entriesForTrip.filter((entry) => entry.kind === tab.key).length,
        }),
        {} as Record<EntryKind, number>,
      ),
    [entriesForTrip],
  );

  function addEntry() {
    const title = draftTitle.trim();
    const note = draftNote.trim();

    if (!title || !note) {
      return;
    }

    const now = new Date().toISOString();
    const randomSuffix = Math.random().toString(36).slice(2, 8);

    setTripState((current) => ({
      ...current,
      entries: [
        {
          id: `${activeTab}-${Date.now()}-${randomSuffix}`,
          tripId: activeTrip.id,
          kind: activeTab,
          title,
          note,
          tag: draftTag,
          author: session?.user.email ?? '我',
          meta: '刚刚添加',
          createdAt: now,
          updatedAt: now,
          syncStatus: 'local',
        },
        ...current.entries,
      ],
    }));
    setDraftTitle('');
    setDraftNote('');
  }

  async function handleSendLoginLink() {
    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setRemoteMessage('请输入邮箱');
      return;
    }

    setIsRemoteBusy(true);
    setRemoteMessage('正在发送登录链接');

    try {
      await sendLoginLink(normalizedEmail);
      setRemoteMessage('登录链接已发送');
    } catch (error) {
      setRemoteMessage(error instanceof Error ? error.message : '发送失败');
    } finally {
      setIsRemoteBusy(false);
    }
  }

  async function handleSignOut() {
    setIsRemoteBusy(true);

    try {
      await signOut();
      setSession(null);
      setRemoteMessage('已退出登录');
    } catch (error) {
      setRemoteMessage(error instanceof Error ? error.message : '退出失败');
    } finally {
      setIsRemoteBusy(false);
    }
  }

  async function handleSyncTrip() {
    if (!session) {
      setRemoteMessage('请先登录');
      return;
    }

    setIsRemoteBusy(true);
    setRemoteMessage('正在同步旅行空间');

    try {
      const syncedState = await pushActiveTrip(tripState, session);
      setTripState(syncedState);
      setRemoteMessage('当前旅行已同步');
    } catch (error) {
      setTripState((current) => ({
        ...current,
        entries: current.entries.map((entry) =>
          entry.tripId === activeTrip.id && entry.syncStatus === 'local'
            ? { ...entry, syncStatus: 'error' }
            : entry,
        ),
      }));
      setRemoteMessage(error instanceof Error ? error.message : '同步失败');
    } finally {
      setIsRemoteBusy(false);
    }
  }

  async function handleJoinInvite() {
    const code = inviteCode.trim();

    if (!session) {
      setRemoteMessage('请先登录');
      return;
    }

    if (!code) {
      setRemoteMessage('请输入邀请码');
      return;
    }

    setIsRemoteBusy(true);
    setRemoteMessage('正在加入旅行');

    try {
      const remoteTrip = await joinTripByInvite(code);
      setTripState((current) => ({
        version: 1,
        activeTripId: remoteTrip.trip.id,
        trips: [
          remoteTrip.trip,
          ...current.trips.filter((trip) => trip.id !== remoteTrip.trip.id),
        ],
        entries: [
          ...remoteTrip.entries,
          ...current.entries.filter((entry) => entry.tripId !== remoteTrip.trip.id),
        ],
      }));
      setInviteCode('');
      setRemoteMessage('已加入旅行');
    } catch (error) {
      setRemoteMessage(error instanceof Error ? error.message : '加入失败');
    } finally {
      setIsRemoteBusy(false);
    }
  }

  if (!isHydrated) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingScreen}>
          <ActivityIndicator color="#152033" />
          <Text style={styles.loadingText}>读取本地旅行库</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.screen} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>Tripmates</Text>
            <Text style={styles.title}>{activeTrip.title}</Text>
          </View>
          <View style={styles.shareBadge}>
            <Text style={styles.shareBadgeText}>{activeTrip.members.length} 人</Text>
          </View>
        </View>

        <View style={styles.statusRow}>
          <Text style={styles.statusPill}>{storageMessage}</Text>
          <Text style={styles.statusPill}>{remoteMessage}</Text>
        </View>

        <View style={styles.tripPanel}>
          <View style={styles.tripSummary}>
            <Text style={styles.tripDate}>
              {activeTrip.dateRange} · {activeTrip.destination}
            </Text>
            <Text style={styles.tripHeadline}>把想去的地方、确认过的信息和路上的瞬间放在一起。</Text>
          </View>
          <View style={styles.inviteStrip}>
            <Text style={styles.inviteLabel}>邀请码</Text>
            <Text style={styles.inviteCode}>{activeTrip.inviteCode}</Text>
          </View>
          <View style={styles.statsRow}>
            <Stat label="灵感" value={counts.idea} tone="mint" />
            <Stat label="攻略" value={counts.guide} tone="sky" />
            <Stat label="行程" value={counts.plan} tone="amber" />
            <Stat label="回忆" value={counts.memory} tone="rose" />
          </View>
        </View>

        <View style={styles.remotePanel}>
          <View style={styles.remoteHeader}>
            <Text style={styles.sectionLabel}>共享空间</Text>
            {isRemoteBusy ? <ActivityIndicator color="#152033" /> : null}
          </View>
          <TextInput
            autoCapitalize="none"
            inputMode="email"
            value={email}
            onChangeText={setEmail}
            placeholder="邮箱"
            placeholderTextColor="#8a94a6"
            style={styles.input}
          />
          <View style={styles.actionRow}>
            <Pressable
              accessibilityRole="button"
              disabled={!isSupabaseConfigured || isRemoteBusy}
              onPress={handleSendLoginLink}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.secondaryButtonPressed,
                (!isSupabaseConfigured || isRemoteBusy) && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.secondaryButtonText}>登录链接</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={!session || isRemoteBusy}
              onPress={handleSyncTrip}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.secondaryButtonPressed,
                (!session || isRemoteBusy) && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.secondaryButtonText}>同步</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={!session || isRemoteBusy}
              onPress={handleSignOut}
              style={({ pressed }) => [
                styles.iconButton,
                pressed && styles.secondaryButtonPressed,
                (!session || isRemoteBusy) && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.iconButtonText}>退</Text>
            </Pressable>
          </View>
          <View style={styles.joinRow}>
            <TextInput
              autoCapitalize="characters"
              value={inviteCode}
              onChangeText={setInviteCode}
              placeholder="输入邀请码"
              placeholderTextColor="#8a94a6"
              style={[styles.input, styles.joinInput]}
            />
            <Pressable
              accessibilityRole="button"
              disabled={!session || isRemoteBusy}
              onPress={handleJoinInvite}
              style={({ pressed }) => [
                styles.joinButton,
                pressed && styles.primaryButtonPressed,
                (!session || isRemoteBusy) && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.primaryButtonText}>加入</Text>
            </Pressable>
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
                <View
                  style={[
                    styles.syncBadge,
                    entry.syncStatus === 'synced' && styles.syncBadgeSynced,
                    entry.syncStatus === 'error' && styles.syncBadgeError,
                  ]}
                >
                  <Text
                    style={[
                      styles.syncBadgeText,
                      entry.syncStatus === 'synced' && styles.syncBadgeTextSynced,
                      entry.syncStatus === 'error' && styles.syncBadgeTextError,
                    ]}
                  >
                    {syncLabels[entry.syncStatus]}
                  </Text>
                </View>
              </View>
              <Text style={styles.entryTitle}>{entry.title}</Text>
              <Text style={styles.entryNote}>{entry.note}</Text>
              <View style={styles.entryBottomRow}>
                <Text style={styles.entryAuthor}>由 {entry.author} 添加</Text>
                <Text style={styles.entryMeta}>{entry.meta}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'mint' | 'sky' | 'amber' | 'rose';
}) {
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
  loadingScreen: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
  },
  loadingText: {
    color: '#526071',
    fontSize: 14,
    fontWeight: '700',
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
    marginBottom: 12,
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
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  statusPill: {
    backgroundColor: '#e9eef6',
    borderRadius: 16,
    color: '#526071',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 6,
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
  inviteStrip: {
    alignItems: 'center',
    backgroundColor: '#f6f8fb',
    borderColor: '#dfe7f1',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inviteLabel: {
    color: '#647187',
    fontSize: 12,
    fontWeight: '800',
  },
  inviteCode: {
    color: '#152033',
    fontSize: 15,
    fontWeight: '900',
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
  remotePanel: {
    backgroundColor: '#ffffff',
    borderColor: '#dfe7f1',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 18,
    padding: 16,
  },
  remoteHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  joinRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  joinInput: {
    flex: 1,
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
  joinButton: {
    alignItems: 'center',
    backgroundColor: '#152033',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 16,
  },
  primaryButtonPressed: {
    backgroundColor: '#243247',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#e9eef6',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: '#e9eef6',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 44,
    width: 48,
  },
  secondaryButtonPressed: {
    backgroundColor: '#dfe7f1',
  },
  secondaryButtonText: {
    color: '#152033',
    fontSize: 14,
    fontWeight: '800',
  },
  iconButtonText: {
    color: '#152033',
    fontSize: 14,
    fontWeight: '900',
  },
  buttonDisabled: {
    opacity: 0.45,
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
  syncBadge: {
    backgroundColor: '#f4f1e8',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  syncBadgeSynced: {
    backgroundColor: '#e7f4ed',
  },
  syncBadgeError: {
    backgroundColor: '#fde5e2',
  },
  syncBadgeText: {
    color: '#7f5d14',
    fontSize: 12,
    fontWeight: '800',
  },
  syncBadgeTextSynced: {
    color: '#247052',
  },
  syncBadgeTextError: {
    color: '#a23b31',
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
  entryBottomRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  entryAuthor: {
    color: '#8792a3',
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    marginRight: 8,
  },
});
