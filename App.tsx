import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as Updates from 'expo-updates';
import {
  ActivityIndicator,
  AppState,
  Linking,
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
  joinCityByInvite,
  pushActiveCity,
  sendLoginLink,
  signOut,
  subscribeToAuthChanges,
} from './src/services/citySync';
import { loadLocalCityState, saveLocalCityState } from './src/storage/localCityStore';
import { EntryKind, LocalCityState, CityEntry, CitySpace } from './src/types';

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

const syncLabels: Record<CityEntry['syncStatus'], string> = {
  local: '本机',
  synced: '已同步',
  error: '待重试',
};

type UpdateStatus = 'idle' | 'unsupported' | 'checking' | 'downloading' | 'ready' | 'restarting' | 'error';

export default function App() {
  const [screen, setScreen] = useState<'home' | 'detail'>('home');
  const [activeTab, setActiveTab] = useState<EntryKind>('idea');
  const [cityState, setCityState] = useState<LocalCityState>(defaultLocalState);
  const [isHydrated, setIsHydrated] = useState(false);
  const [storageMessage, setStorageMessage] = useState('读取本地数据');
  const [session, setSession] = useState<Session | null>(null);
  const [remoteMessage, setRemoteMessage] = useState(
    isSupabaseConfigured ? 'Supabase 已准备连接' : '本地模式',
  );
  const [isRemoteBusy, setIsRemoteBusy] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftNote, setDraftNote] = useState('');
  const [draftUrl, setDraftUrl] = useState('');
  const [draftAiSummary, setDraftAiSummary] = useState('');
  const [draftTag, setDraftTag] = useState(tags[0]);
  const [cityName, setCityName] = useState('');
  const [cityFocus, setCityFocus] = useState('');
  const [email, setEmail] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>(
    isOtaUpdateRuntimeAvailable() ? 'idle' : 'unsupported',
  );
  const [updateMessage, setUpdateMessage] = useState(getInitialUpdateMessage());
  const updateStatusRef = useRef(updateStatus);

  useEffect(() => {
    let isMounted = true;

    loadLocalCityState()
      .then((storedState) => {
        if (!isMounted) {
          return;
        }

        setCityState(storedState);
        setStorageMessage('本机已保存');
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setCityState(defaultLocalState);
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

    saveLocalCityState(cityState)
      .then(() => setStorageMessage('本机已保存'))
      .catch(() => setStorageMessage('本机保存失败'));
  }, [isHydrated, cityState]);

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

  useEffect(() => {
    updateStatusRef.current = updateStatus;
  }, [updateStatus]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    checkForAppUpdate(true);

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        checkForAppUpdate(true);
      }
    });

    return () => subscription.remove();
  }, [isHydrated]);

  const activeCity = useMemo(
    () =>
      cityState.cities.find((city) => city.id === cityState.activeCityId) ??
      cityState.cities[0] ??
      defaultLocalState.cities[0],
    [cityState.activeCityId, cityState.cities],
  );

  const entriesForCity = useMemo(
    () => cityState.entries.filter((entry) => entry.cityId === activeCity.id),
    [activeCity.id, cityState.entries],
  );

  const activeEntries = useMemo(
    () => entriesForCity.filter((entry) => entry.kind === activeTab),
    [activeTab, entriesForCity],
  );

  const ideaEntries = useMemo(
    () => entriesForCity.filter((entry) => entry.kind === 'idea'),
    [entriesForCity],
  );

  const counts = useMemo(
    () => getCountsForCity(activeCity.id, cityState.entries),
    [activeCity.id, cityState.entries],
  );

  const normalizedDraftUrl = useMemo(
    () => (activeTab === 'idea' ? normalizeSourceUrl(draftUrl) : ''),
    [activeTab, draftUrl],
  );

  const cityCards = useMemo(
    () =>
      cityState.cities.map((city) => ({
        city,
        counts: getCountsForCity(city.id, cityState.entries),
        latestEntry: cityState.entries.find((entry) => entry.cityId === city.id),
      })),
    [cityState.entries, cityState.cities],
  );

  function openCity(cityId: string) {
    setCityState((current) => ({
      ...current,
      activeCityId: cityId,
    }));
    setActiveTab('idea');
    setScreen('detail');
  }

  function addCity() {
    const title = cityName.trim();
    const destination = cityFocus.trim();

    if (!title) {
      return;
    }

    const now = new Date().toISOString();
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const fallbackSlug = Math.random().toString(36).slice(2, 8);
    const cityId = `city-${slug || fallbackSlug}-${Date.now()}`;
    const codeStem = slug ? slug.replace(/-/g, '').slice(0, 6).toUpperCase() : 'CITY';
    const inviteCode = `${codeStem}${Math.floor(Math.random() * 90 + 10)}`;
    const nextCity: CitySpace = {
      id: cityId,
      title,
      destination: destination || '待整理',
      dateRange: '城市资料库',
      inviteCode,
      members: [session?.user.email ?? '我'],
      createdAt: now,
      updatedAt: now,
    };

    setCityState((current) => ({
      ...current,
      activeCityId: nextCity.id,
      cities: [nextCity, ...current.cities],
    }));
    setCityName('');
    setCityFocus('');
    setActiveTab('idea');
    setScreen('detail');
  }

  function addEntry() {
    const note = draftNote.trim();
    const sourceUrl =
      activeTab === 'idea' ? normalizedDraftUrl || normalizeSourceUrl(note) : '';
    const title = getDraftTitle(draftTitle, note, sourceUrl, activeTab);
    const finalNote =
      activeTab === 'idea' && sourceUrl && !note
        ? '先收进来，稍后整理地点、亮点和注意事项。'
        : note;

    if (!title || !finalNote) {
      return;
    }

    const now = new Date().toISOString();
    const randomSuffix = Math.random().toString(36).slice(2, 8);

    setCityState((current) => ({
      ...current,
      entries: [
        {
          id: `${activeTab}-${Date.now()}-${randomSuffix}`,
          cityId: activeCity.id,
          kind: activeTab,
          title,
          note: finalNote,
          sourceUrl: sourceUrl || undefined,
          aiSummary: draftAiSummary || undefined,
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
    setDraftUrl('');
    setDraftAiSummary('');
  }

  function handlePrepareLinkSummary() {
    const sourceUrl = normalizedDraftUrl || normalizeSourceUrl(draftNote);

    if (!sourceUrl) {
      setStorageMessage('先粘贴一个灵感链接');
      return;
    }

    const sourceName = getLinkSourceName(sourceUrl);
    const nextSummary = buildIdeaSummaryDraft({
      city: activeCity,
      note: draftNote,
      rawSourceText: draftUrl,
      sourceUrl,
      tag: draftTag,
      title: draftTitle,
    });

    setDraftUrl(sourceUrl);
    setDraftAiSummary(nextSummary);
    setDraftNote((current) =>
      current.trim()
        ? current
        : `先收进来：${sourceName} 里的旅行灵感，待核对地点、时间、交通和适合放进哪一天。`,
    );
    setStorageMessage('链接摘要已生成');
  }

  function handleDraftUrlChange(value: string) {
    setDraftUrl(value);

    const sourceUrl = normalizeSourceUrl(value);

    if (!sourceUrl) {
      setDraftAiSummary('');
      return;
    }

    setDraftAiSummary(
      buildIdeaSummaryDraft({
        city: activeCity,
        note: draftNote,
        rawSourceText: value,
        sourceUrl,
        tag: draftTag,
        title: draftTitle,
      }),
    );
  }

  function handleGenerateGuideFromIdeas() {
    if (ideaEntries.length === 0) {
      setStorageMessage('先在灵感里放一些想去的地方');
      return;
    }

    const now = new Date().toISOString();
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    const guideNote = buildGuideDraftFromIdeas(activeCity, ideaEntries);

    setCityState((current) => ({
      ...current,
      entries: [
        {
          id: `guide-${Date.now()}-${randomSuffix}`,
          cityId: activeCity.id,
          kind: 'guide',
          title: `${activeCity.title} 每日攻略草稿`,
          note: guideNote,
          tag: '景点',
          author: session?.user.email ?? '我',
          meta: `由 ${ideaEntries.length} 条灵感生成`,
          createdAt: now,
          updatedAt: now,
          syncStatus: 'local',
        },
        ...current.entries,
      ],
    }));
    setActiveTab('guide');
    setDraftTitle('');
    setDraftNote('');
    setDraftUrl('');
    setDraftAiSummary('');
    setStorageMessage('攻略草稿已生成');
  }

  async function openEntryLink(sourceUrl: string) {
    try {
      await Linking.openURL(sourceUrl);
    } catch {
      setStorageMessage('链接打开失败');
    }
  }

  async function checkForAppUpdate(isAutomatic = false) {
    if (
      isAutomatic &&
      ['checking', 'downloading', 'ready', 'restarting'].includes(updateStatusRef.current)
    ) {
      return;
    }

    if (!isOtaUpdateRuntimeAvailable()) {
      setUpdateStatus('unsupported');
      setUpdateMessage(getInitialUpdateMessage());
      return;
    }

    setUpdateStatus('checking');
    setUpdateMessage(isAutomatic ? '正在检查有没有新版本' : '正在手动检查更新');

    try {
      const update = await Updates.checkForUpdateAsync();

      if (!update.isAvailable) {
        setUpdateStatus('idle');
        setUpdateMessage('当前已经是最新版本');
        return;
      }

      setUpdateStatus('downloading');
      setUpdateMessage('发现新版本，正在下载');
      await Updates.fetchUpdateAsync();
      setUpdateStatus('ready');
      setUpdateMessage('新版本已下载，点重启后生效');
    } catch (error) {
      setUpdateStatus('error');
      setUpdateMessage(error instanceof Error ? error.message : '检查更新失败');
    }
  }

  async function applyDownloadedUpdate() {
    if (!isOtaUpdateRuntimeAvailable()) {
      setUpdateStatus('unsupported');
      setUpdateMessage(getInitialUpdateMessage());
      return;
    }

    setUpdateStatus('restarting');
    setUpdateMessage('正在重启应用');

    try {
      await Updates.reloadAsync();
    } catch (error) {
      setUpdateStatus('error');
      setUpdateMessage(error instanceof Error ? error.message : '重启更新失败');
    }
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

  async function handleSyncCity() {
    if (!session) {
      setRemoteMessage('请先登录');
      return;
    }

    setIsRemoteBusy(true);
    setRemoteMessage('正在同步城市空间');

    try {
      const syncedState = await pushActiveCity(cityState, session);
      setCityState(syncedState);
      setRemoteMessage('当前城市已同步');
    } catch (error) {
      setCityState((current) => ({
        ...current,
        entries: current.entries.map((entry) =>
          entry.cityId === activeCity.id && entry.syncStatus === 'local'
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
    setRemoteMessage('正在加入城市');

    try {
      const remoteCity = await joinCityByInvite(code);
      setCityState((current) => ({
        version: 3,
        activeCityId: remoteCity.city.id,
        cities: [
          remoteCity.city,
          ...current.cities.filter((city) => city.id !== remoteCity.city.id),
        ],
        entries: [
          ...remoteCity.entries,
          ...current.entries.filter((entry) => entry.cityId !== remoteCity.city.id),
        ],
      }));
      setInviteCode('');
      setActiveTab('idea');
      setScreen('detail');
      setRemoteMessage('已加入城市');
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
          <Text style={styles.loadingText}>读取本地城市库</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (screen === 'home') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <ScrollView contentContainerStyle={styles.screen} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View>
              <Text style={styles.kicker}>Tripmates</Text>
              <Text style={styles.title}>城市旅行库</Text>
            </View>
            <View style={styles.shareBadge}>
              <Text style={styles.shareBadgeText}>{cityState.cities.length} 城</Text>
            </View>
          </View>

          <View style={styles.statusRow}>
            <Text style={styles.statusPill}>{storageMessage}</Text>
            <Text style={styles.statusPill}>{remoteMessage}</Text>
          </View>

          <UpdatePanel
            status={updateStatus}
            message={updateMessage}
            onCheck={() => checkForAppUpdate(false)}
            onRestart={applyDownloadedUpdate}
          />

          <View style={styles.homeIntro}>
            <Text style={styles.homeIntroTitle}>先选城市，再整理攻略。</Text>
            <Text style={styles.homeIntroText}>
              每座城市都有自己的灵感、攻略、行程和回忆，适合慢慢积累成你和朋友的私人资料库。
            </Text>
          </View>

          <UsageGuide />

          <View style={styles.cityGrid}>
            {cityCards.map(({ city, counts: cityCounts, latestEntry }) => (
              <Pressable
                key={city.id}
                accessibilityRole="button"
                onPress={() => openCity(city.id)}
                style={({ pressed }) => [styles.cityCard, pressed && styles.cityCardPressed]}
              >
                <View style={styles.cityCardHeader}>
                  <View style={styles.cityTitleBlock}>
                    <Text style={styles.cityName}>{city.title}</Text>
                    <Text style={styles.cityDestination}>{city.destination}</Text>
                  </View>
                  <Text style={styles.cityMembers}>{city.members.length} 人</Text>
                </View>
                <View style={styles.cityStatsRow}>
                  <MiniStat label="灵感" value={cityCounts.idea} />
                  <MiniStat label="攻略" value={cityCounts.guide} />
                  <MiniStat label="行程" value={cityCounts.plan} />
                  <MiniStat label="回忆" value={cityCounts.memory} />
                </View>
                <Text style={styles.cityLatest} numberOfLines={2}>
                  {latestEntry ? latestEntry.title : '还没有内容，点开开始整理。'}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.composer}>
            <Text style={styles.sectionLabel}>新增城市</Text>
            <TextInput
              value={cityName}
              onChangeText={setCityName}
              placeholder="城市名，比如 东京"
              placeholderTextColor="#8a94a6"
              style={styles.input}
            />
            <TextInput
              value={cityFocus}
              onChangeText={setCityFocus}
              placeholder="这个城市想整理什么，比如 咖啡 / 博物馆 / 住宿区"
              placeholderTextColor="#8a94a6"
              style={[styles.input, styles.cityFocusInput]}
            />
            <Pressable
              accessibilityRole="button"
              onPress={addCity}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.primaryButtonPressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>创建城市卡片</Text>
            </Pressable>
          </View>
        </ScrollView>
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
            <Text style={styles.title}>{activeCity.title}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => setScreen('home')}
            style={({ pressed }) => [styles.backButton, pressed && styles.secondaryButtonPressed]}
          >
            <Text style={styles.backButtonText}>城市</Text>
          </Pressable>
        </View>

        <View style={styles.statusRow}>
          <Text style={styles.statusPill}>{storageMessage}</Text>
          <Text style={styles.statusPill}>{remoteMessage}</Text>
        </View>

        <UpdatePanel
          status={updateStatus}
          message={updateMessage}
          onCheck={() => checkForAppUpdate(false)}
          onRestart={applyDownloadedUpdate}
        />

        <View style={styles.cityPanel}>
          <View style={styles.citySummary}>
            <Text style={styles.cityDate}>
              {activeCity.dateRange} · {activeCity.destination}
            </Text>
            <Text style={styles.cityHeadline}>把这座城市想去的地方、确认过的信息和路上的瞬间放在一起。</Text>
          </View>
          <View style={styles.inviteStrip}>
            <Text style={styles.inviteLabel}>邀请码</Text>
            <Text style={styles.inviteCode}>{activeCity.inviteCode}</Text>
          </View>
          <View style={styles.statsRow}>
            <Stat label="灵感" value={counts.idea} tone="mint" />
            <Stat label="攻略" value={counts.guide} tone="sky" />
            <Stat label="行程" value={counts.plan} tone="amber" />
            <Stat label="回忆" value={counts.memory} tone="rose" />
          </View>
        </View>

        <View style={styles.guidePanel}>
          <Text style={styles.sectionLabel}>怎么放内容</Text>
          <Text style={styles.guideText}>
            灵感先丢一句话或小红书、抖音链接；攻略可以从灵感生成草稿；行程放日期安排；回忆放回来后想留下的瞬间。
          </Text>
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
              onPress={handleSyncCity}
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

        {activeTab === 'guide' ? (
          <GuideGeneratorPanel
            ideaCount={ideaEntries.length}
            onGenerate={handleGenerateGuideFromIdeas}
          />
        ) : null}

        <View style={styles.composer}>
          <Text style={styles.sectionLabel}>{getComposerTitle(activeTab)}</Text>
          <TextInput
            value={draftTitle}
            onChangeText={setDraftTitle}
            placeholder={activeTab === 'idea' ? '标题，可不填，比如 喀什咖啡店' : '标题'}
            placeholderTextColor="#8a94a6"
            style={styles.input}
          />
          {activeTab === 'idea' ? (
            <>
              <View style={styles.inputLabelRow}>
                <Text style={styles.inputLabel}>小红书 / 抖音链接</Text>
                <Text style={styles.inputMeta}>可粘贴整段分享文本</Text>
              </View>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                value={draftUrl}
                onChangeText={handleDraftUrlChange}
                placeholder="粘贴链接，比如 https://..."
                placeholderTextColor="#8a94a6"
                style={[styles.input, styles.linkInput]}
              />
              <View style={styles.linkActionRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={handlePrepareLinkSummary}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    styles.summaryButton,
                    pressed && styles.secondaryButtonPressed,
                  ]}
                >
                  <Text style={styles.secondaryButtonText}>AI 总结链接</Text>
                </Pressable>
                <Text style={styles.linkHint}>生成可编辑摘要和待核对清单。</Text>
              </View>
              {draftAiSummary ? <Text style={styles.aiSummaryPreview}>{draftAiSummary}</Text> : null}
            </>
          ) : null}
          <TextInput
            value={draftNote}
            onChangeText={setDraftNote}
            placeholder={activeTab === 'idea' ? '自己写灵感，也可以只放上面的链接' : '记录一点细节'}
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
              {entry.sourceUrl ? (
                <Pressable
                  accessibilityRole="link"
                  onPress={() => openEntryLink(entry.sourceUrl!)}
                  style={({ pressed }) => [styles.sourceLink, pressed && styles.sourceLinkPressed]}
                >
                  <Text style={styles.sourceLinkLabel}>来源</Text>
                  <Text style={styles.sourceLinkText} numberOfLines={1}>
                    {getLinkSourceName(entry.sourceUrl)} · 打开链接
                  </Text>
                </Pressable>
              ) : null}
              {entry.aiSummary ? (
                <View style={styles.aiSummaryBox}>
                  <Text style={styles.aiSummaryLabel}>AI 摘要</Text>
                  <Text style={styles.aiSummaryText}>{entry.aiSummary}</Text>
                </View>
              ) : null}
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

function UpdatePanel({
  status,
  message,
  onCheck,
  onRestart,
}: {
  status: UpdateStatus;
  message: string;
  onCheck: () => void;
  onRestart: () => void;
}) {
  const isBusy = status === 'checking' || status === 'downloading' || status === 'restarting';
  const isReady = status === 'ready';
  const isUnsupported = status === 'unsupported';
  const buttonLabel = isReady ? '重启更新' : isBusy ? '处理中' : '检查更新';

  return (
    <View style={styles.updatePanel}>
      <View style={styles.updateCopy}>
        <View style={styles.updateHeaderRow}>
          <Text style={styles.sectionLabel}>应用更新</Text>
          {isBusy ? <ActivityIndicator color="#152033" /> : null}
        </View>
        <Text style={styles.updateMessage}>{message}</Text>
        <Text style={styles.updateMeta}>{getUpdateRuntimeLabel()}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={isBusy || isUnsupported}
        onPress={isReady ? onRestart : onCheck}
        style={({ pressed }) => [
          styles.updateButton,
          isReady && styles.updateButtonReady,
          pressed && styles.secondaryButtonPressed,
          (isBusy || isUnsupported) && styles.buttonDisabled,
        ]}
      >
        <Text style={[styles.updateButtonText, isReady && styles.updateButtonReadyText]}>
          {buttonLabel}
        </Text>
      </Pressable>
    </View>
  );
}

function GuideGeneratorPanel({
  ideaCount,
  onGenerate,
}: {
  ideaCount: number;
  onGenerate: () => void;
}) {
  const hasIdeas = ideaCount > 0;

  return (
    <View style={styles.generatorPanel}>
      <View style={styles.generatorCopy}>
        <Text style={styles.sectionLabel}>攻略生成</Text>
        <Text style={styles.generatorText}>
          {hasIdeas
            ? `已有 ${ideaCount} 条灵感，可以先排成每日攻略草稿。`
            : '先在灵感里放链接或想法，再回来生成攻略草稿。'}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={!hasIdeas}
        onPress={onGenerate}
        style={({ pressed }) => [
          styles.generatorButton,
          pressed && styles.primaryButtonPressed,
          !hasIdeas && styles.buttonDisabled,
        ]}
      >
        <Text style={styles.primaryButtonText}>一键生成攻略</Text>
      </Pressable>
    </View>
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

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.miniStat}>
      <Text style={styles.miniStatValue}>{value}</Text>
      <Text style={styles.miniStatLabel}>{label}</Text>
    </View>
  );
}

function getComposerTitle(activeTab: EntryKind) {
  if (activeTab === 'idea') {
    return '收集灵感';
  }

  return `添加到${kindLabels[activeTab]}`;
}

function UsageGuide() {
  return (
    <View style={styles.guidePanel}>
      <Text style={styles.sectionLabel}>使用说明</Text>
      <Text style={styles.guideText}>1. 首页先建城市卡片，比如新疆、广西。</Text>
      <Text style={styles.guideText}>2. 点进城市后，把内容分到灵感、攻略、行程、回忆。</Text>
      <Text style={styles.guideText}>3. 灵感可以自己写，也可以先贴小红书、抖音或网页链接。</Text>
      <Text style={styles.guideText}>4. 登录后可以同步当前城市，再用邀请码邀请朋友加入。</Text>
    </View>
  );
}

function getCountsForCity(cityId: string, entries: CityEntry[]) {
  return tabs.reduce(
    (memo, tab) => ({
      ...memo,
      [tab.key]: entries.filter((entry) => entry.cityId === cityId && entry.kind === tab.key)
        .length,
    }),
    {} as Record<EntryKind, number>,
  );
}

function isOtaUpdateRuntimeAvailable() {
  return Updates.isEnabled && Boolean(Updates.channel) && Boolean(Updates.runtimeVersion);
}

function getInitialUpdateMessage() {
  if (!isOtaUpdateRuntimeAvailable()) {
    return '当前是本地预览环境；安装新的 preview APK 后即可接收 OTA 更新提示。';
  }

  return '启动时会自动检查小更新';
}

function getUpdateRuntimeLabel() {
  if (!isOtaUpdateRuntimeAvailable()) {
    return 'OTA 未启用';
  }

  return `频道 ${Updates.channel} · runtime ${Updates.runtimeVersion}`;
}

function getDraftTitle(
  rawTitle: string,
  note: string,
  sourceUrl: string,
  activeTab: EntryKind,
) {
  const title = rawTitle.trim();

  if (title) {
    return title;
  }

  if (activeTab === 'idea' && sourceUrl) {
    return `${getLinkSourceName(sourceUrl)} 灵感`;
  }

  if (activeTab === 'idea' && note) {
    const firstLine = note.split('\n')[0].trim();
    return firstLine.length > 18 ? `${firstLine.slice(0, 18)}...` : firstLine;
  }

  return '';
}

function normalizeSourceUrl(rawValue: string) {
  const raw = rawValue.trim();

  if (!raw) {
    return '';
  }

  const match = raw.match(/https?:\/\/[^\s，。；、)）]+/i) ?? raw.match(/www\.[^\s，。；、)）]+/i);

  if (!match) {
    return '';
  }

  const withoutTrailingPunctuation = match[0].replace(/[，。；、,.!?！？)）]+$/g, '');

  return withoutTrailingPunctuation.startsWith('www.')
    ? `https://${withoutTrailingPunctuation}`
    : withoutTrailingPunctuation;
}

function getLinkSourceName(sourceUrl: string) {
  try {
    const host = new URL(sourceUrl).hostname.replace(/^www\./, '');

    if (host.includes('xiaohongshu')) {
      return '小红书';
    }

    if (host.includes('douyin')) {
      return '抖音';
    }

    return host;
  } catch {
    return '链接';
  }
}

function buildIdeaSummaryDraft({
  city,
  note,
  rawSourceText,
  sourceUrl,
  tag,
  title,
}: {
  city: CitySpace;
  note: string;
  rawSourceText: string;
  sourceUrl: string;
  tag: string;
  title: string;
}) {
  const sourceName = getLinkSourceName(sourceUrl);
  const cleanShareText = getUsefulShareText(rawSourceText, sourceUrl);
  const signal = cleanShareText || title.trim() || note.trim() || `${city.title} ${tag}灵感`;

  return [
    `来源：${sourceName}`,
    `可能主题：${clipText(signal, 56)}`,
    `适合放进：${city.title} · ${tag}`,
    '待核对：具体地址、开放时间、预约方式、交通耗时、费用。',
  ].join('\n');
}

function buildGuideDraftFromIdeas(city: CitySpace, ideas: CityEntry[]) {
  const selectedIdeas = [...ideas]
    .sort((first, second) => Date.parse(first.createdAt) - Date.parse(second.createdAt))
    .slice(0, 10);
  const dayCount = Math.min(5, Math.max(2, Math.ceil(selectedIdeas.length / 2)));
  const lines = [
    `目标：把 ${city.title} 的 ${selectedIdeas.length} 条灵感先排成 ${dayCount} 天攻略草稿。`,
    `范围：${city.destination}`,
    '出发前核对：位置、开放时间、门票/预约、天气、交通耗时和闭店日。',
    '',
  ];

  for (let dayIndex = 0; dayIndex < dayCount; dayIndex += 1) {
    const morningIdea = selectedIdeas[dayIndex * 2] ?? selectedIdeas[0];
    const afternoonIdea = selectedIdeas[dayIndex * 2 + 1] ?? selectedIdeas[dayIndex] ?? selectedIdeas[0];
    const eveningIdea = selectedIdeas[(dayIndex * 2 + 2) % selectedIdeas.length] ?? afternoonIdea;

    lines.push(
      `Day ${dayIndex + 1}：${clipText(morningIdea.title, 22)}`,
      `上午：${summarizeIdeaForGuide(morningIdea)}`,
      `下午：${summarizeIdeaForGuide(afternoonIdea)}`,
      `晚上：围绕 ${clipText(eveningIdea.title, 18)} 安排吃饭、散步或休息。`,
      '待查：把当天地点按地图顺路排序，再确认营业时间和交通方式。',
      '',
    );
  }

  lines.push('下一步：把确认后的地址、时间和预约信息补到攻略里，再把已定日期放进行程。');

  return lines.join('\n');
}

function summarizeIdeaForGuide(entry: CityEntry) {
  const source = entry.sourceUrl ? `（来源：${getLinkSourceName(entry.sourceUrl)}）` : '';
  const summary = entry.aiSummary || entry.note;

  return `${clipText(entry.title, 18)}${source}：${clipText(summary, 54)}`;
}

function getUsefulShareText(rawSourceText: string, sourceUrl: string) {
  return rawSourceText
    .replace(sourceUrl, '')
    .replace(/https?:\/\/[^\s，。；、)）]+/gi, '')
    .replace(/www\.[^\s，。；、)）]+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function clipText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, ' ').trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
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
  backButton: {
    alignItems: 'center',
    backgroundColor: '#e9eef6',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  backButtonText: {
    color: '#152033',
    fontSize: 14,
    fontWeight: '900',
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
  updatePanel: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#dfe7f1',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
    padding: 14,
  },
  updateCopy: {
    flex: 1,
  },
  updateHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  updateMessage: {
    color: '#48576b',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  updateMeta: {
    color: '#8792a3',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 4,
  },
  updateButton: {
    alignItems: 'center',
    backgroundColor: '#e9eef6',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 92,
    paddingHorizontal: 12,
  },
  updateButtonReady: {
    backgroundColor: '#0f766e',
  },
  updateButtonText: {
    color: '#152033',
    fontSize: 14,
    fontWeight: '900',
  },
  updateButtonReadyText: {
    color: '#ffffff',
  },
  homeIntro: {
    backgroundColor: '#ffffff',
    borderColor: '#dfe7f1',
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  homeIntroTitle: {
    color: '#152033',
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 26,
  },
  homeIntroText: {
    color: '#526071',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
  guidePanel: {
    backgroundColor: '#ffffff',
    borderColor: '#dfe7f1',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 16,
    padding: 16,
  },
  guideText: {
    color: '#526071',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
    marginTop: 4,
  },
  cityGrid: {
    gap: 12,
    marginTop: 16,
  },
  cityCard: {
    backgroundColor: '#ffffff',
    borderColor: '#dfe7f1',
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  cityCardPressed: {
    backgroundColor: '#f9fbfe',
  },
  cityCardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  cityTitleBlock: {
    flex: 1,
  },
  cityName: {
    color: '#152033',
    fontSize: 23,
    fontWeight: '900',
    lineHeight: 29,
  },
  cityDestination: {
    color: '#647187',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 4,
  },
  cityMembers: {
    backgroundColor: '#edf2f8',
    borderRadius: 16,
    color: '#526071',
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  cityStatsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  miniStat: {
    backgroundColor: '#f5f7fb',
    borderRadius: 8,
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  miniStatValue: {
    color: '#152033',
    fontSize: 18,
    fontWeight: '900',
  },
  miniStatLabel: {
    color: '#647187',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
  },
  cityLatest: {
    color: '#48576b',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 12,
  },
  cityPanel: {
    backgroundColor: '#ffffff',
    borderColor: '#dfe7f1',
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  citySummary: {
    marginBottom: 14,
  },
  cityDate: {
    color: '#647187',
    fontSize: 13,
    fontWeight: '700',
  },
  cityHeadline: {
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
  generatorPanel: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#dfe7f1',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
    padding: 16,
  },
  generatorCopy: {
    flex: 1,
  },
  generatorText: {
    color: '#526071',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  generatorButton: {
    alignItems: 'center',
    backgroundColor: '#152033',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 14,
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
  inputLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  inputLabel: {
    color: '#32445b',
    fontSize: 13,
    fontWeight: '900',
  },
  inputMeta: {
    color: '#8792a3',
    fontSize: 12,
    fontWeight: '700',
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
  linkInput: {
    marginTop: 10,
  },
  linkActionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  summaryButton: {
    flex: 0,
    minWidth: 92,
    paddingHorizontal: 12,
  },
  linkHint: {
    color: '#7a8597',
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  aiSummaryPreview: {
    backgroundColor: '#f7f3ea',
    borderColor: '#eadfca',
    borderRadius: 8,
    borderWidth: 1,
    color: '#6b582d',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 10,
    padding: 10,
  },
  cityFocusInput: {
    marginTop: 10,
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
  sourceLink: {
    alignItems: 'center',
    backgroundColor: '#eef4fb',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  sourceLinkPressed: {
    backgroundColor: '#e2ebf7',
  },
  sourceLinkLabel: {
    color: '#4d6684',
    fontSize: 12,
    fontWeight: '900',
  },
  sourceLinkText: {
    color: '#152033',
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
  },
  aiSummaryBox: {
    backgroundColor: '#f7f3ea',
    borderColor: '#eadfca',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 10,
    padding: 10,
  },
  aiSummaryLabel: {
    color: '#6b582d',
    fontSize: 12,
    fontWeight: '900',
  },
  aiSummaryText: {
    color: '#6b582d',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 4,
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
