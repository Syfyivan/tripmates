import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as Updates from 'expo-updates';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Modal,
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
  createCodexExport,
  deleteCityEntry,
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

const appCapabilityVersion = '版本 1.0.8 · 功能 2026-06-06.6';
const updateSuccessSignal = '看到 Codex 导出码就是新版本。';

type UpdateStatus = 'idle' | 'unsupported' | 'checking' | 'downloading' | 'ready' | 'restarting' | 'error';
type CodexExportState = { token: string; expiresAt: string };

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
  const [pendingDeleteEntry, setPendingDeleteEntry] = useState<CityEntry | null>(null);
  const [codexExport, setCodexExport] = useState<CodexExportState | null>(null);
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

  const guideEntries = useMemo(
    () => entriesForCity.filter((entry) => entry.kind === 'guide'),
    [entriesForCity],
  );

  const counts = useMemo(
    () => getCountsForCity(activeCity.id, cityState.entries),
    [activeCity.id, cityState.entries],
  );

  const normalizedDraftUrl = useMemo(
    () => (activeTab === 'idea' || activeTab === 'guide' ? normalizeSourceUrl(draftUrl) : ''),
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
    setCodexExport(null);
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
      activeTab === 'idea' || activeTab === 'guide'
        ? normalizedDraftUrl || normalizeSourceUrl(note)
        : '';

    if (activeTab === 'idea' && sourceUrl && !isSupportedInspirationLink(sourceUrl)) {
      setStorageMessage('灵感链接目前只支持小红书或抖音');
      return;
    }

    const title = getDraftTitle(draftTitle, note, sourceUrl, activeTab);
    const finalNote = getDraftNote(note, sourceUrl, activeTab);

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

  function handlePrepareInspirationLink() {
    const sourceUrl = normalizedDraftUrl || normalizeSourceUrl(draftNote);

    if (!sourceUrl) {
      setStorageMessage('先粘贴小红书或抖音链接');
      return;
    }

    if (!isSupportedInspirationLink(sourceUrl)) {
      setStorageMessage('灵感链接目前只支持小红书或抖音');
      return;
    }

    const sourceName = getLinkSourceName(sourceUrl);

    setDraftUrl(sourceUrl);
    setDraftAiSummary('');
    setDraftNote((current) =>
      current.trim()
        ? current
        : `已收集 ${sourceName} 链接。图文或长文更适合后续用 Codex 整理；如果是短视频，建议补一句视频重点。`,
    );
    setStorageMessage('链接已准备保存，点添加完成收集');
  }

  function handleDraftUrlChange(value: string) {
    setDraftUrl(value);

    const sourceUrl = normalizeSourceUrl(value);

    if (!sourceUrl) {
      setDraftAiSummary('');
      return;
    }

    if (activeTab === 'idea') {
      setDraftAiSummary('');
      return;
    }

    if (activeTab === 'guide') {
      setDraftAiSummary(
        buildGuideDocSummaryDraft({
          city: activeCity,
          note: draftNote,
          rawSourceText: value,
          sourceUrl,
          title: draftTitle,
        }),
      );
    }
  }

  function handlePrepareGuideDoc() {
    const sourceUrl = normalizedDraftUrl || normalizeSourceUrl(draftNote);

    if (!sourceUrl) {
      setStorageMessage('先粘贴一个飞书文档链接');
      return;
    }

    const sourceName = getLinkSourceName(sourceUrl);
    const nextSummary = buildGuideDocSummaryDraft({
      city: activeCity,
      note: draftNote,
      rawSourceText: draftUrl,
      sourceUrl,
      title: draftTitle,
    });

    setDraftUrl(sourceUrl);
    setDraftAiSummary(nextSummary);
    setDraftNote((current) =>
      current.trim()
        ? current
        : `已关联 ${sourceName} 攻略文档。下一步需要从文档里核对日期、地点、交通、预约和预算。`,
    );
    setStorageMessage('攻略文档已关联');
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

  function handleGeneratePlanFromGuides() {
    if (guideEntries.length === 0) {
      setStorageMessage('先在攻略里添加飞书文档或攻略草稿');
      return;
    }

    const now = new Date().toISOString();
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    const planNote = buildPlanDraftFromGuides(activeCity, guideEntries, ideaEntries);

    setCityState((current) => ({
      ...current,
      entries: [
        {
          id: `plan-${Date.now()}-${randomSuffix}`,
          cityId: activeCity.id,
          kind: 'plan',
          title: `${activeCity.title} 行程草稿`,
          note: planNote,
          tag: '交通',
          author: session?.user.email ?? '我',
          meta: `由 ${guideEntries.length} 条攻略生成`,
          createdAt: now,
          updatedAt: now,
          syncStatus: 'local',
        },
        ...current.entries,
      ],
    }));
    setActiveTab('plan');
    setDraftTitle('');
    setDraftNote('');
    setDraftUrl('');
    setDraftAiSummary('');
    setStorageMessage('行程草稿已生成');
  }

  async function openEntryLink(sourceUrl: string) {
    try {
      await Linking.openURL(sourceUrl);
    } catch {
      setStorageMessage('链接打开失败');
    }
  }

  function confirmDeleteEntry(entry: CityEntry) {
    if (!isDeletableEntryKind(entry.kind)) {
      return;
    }

    setPendingDeleteEntry(entry);
  }

  function cancelPendingDelete() {
    setPendingDeleteEntry(null);
  }

  function confirmPendingDelete() {
    const entry = pendingDeleteEntry;

    if (!entry) {
      return;
    }

    setPendingDeleteEntry(null);
    void handleDeleteEntry(entry);
  }

  async function handleDeleteEntry(entry: CityEntry) {
    if (!isDeletableEntryKind(entry.kind)) {
      return;
    }

    if (entry.remoteId && entry.syncStatus === 'synced') {
      if (!session) {
        setRemoteMessage('已同步记录需要登录后删除');
        return;
      }

      setIsRemoteBusy(true);
      setRemoteMessage('正在删除远端记录');

      try {
        await deleteCityEntry(entry);
      } catch (error) {
        setRemoteMessage(error instanceof Error ? error.message : '远端删除失败');
        setIsRemoteBusy(false);
        return;
      }

      setIsRemoteBusy(false);
      setRemoteMessage('记录已删除');
    }

    setCityState((current) => ({
      ...current,
      entries: current.entries.filter((candidate) => candidate.id !== entry.id),
    }));
    setStorageMessage(`${kindLabels[entry.kind]}已删除`);
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
      setCodexExport(null);
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

  async function handleCreateCodexExport() {
    if (!session) {
      setRemoteMessage('请先登录');
      return;
    }

    setIsRemoteBusy(true);
    setRemoteMessage('正在同步并生成 Codex 导出码');

    try {
      const syncedState = await pushActiveCity(cityState, session);
      setCityState(syncedState);

      const nextExport = await createCodexExport(syncedState.activeCityId);
      setCodexExport(nextExport);
      setRemoteMessage('Codex 导出码已生成');
    } catch (error) {
      setRemoteMessage(error instanceof Error ? error.message : 'Codex 导出码生成失败');
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
      setCodexExport(null);
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
      <DeleteConfirmModal
        entry={pendingDeleteEntry}
        onCancel={cancelPendingDelete}
        onConfirm={confirmPendingDelete}
      />
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
            灵感先丢一句话或小红书、抖音链接；攻略可以关联飞书文档；行程可以按攻略生成草稿；回忆放回来后想留下的瞬间。
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
          <View style={styles.codexExportSection}>
            <Text style={styles.inputLabel}>Codex 自动整理</Text>
            <Text style={styles.codexExportText}>
              登录后生成 15 分钟导出码。把导出码发给 Codex，Codex 就能读取当前城市已同步的灵感和攻略。
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={!session || isRemoteBusy}
              onPress={handleCreateCodexExport}
              style={({ pressed }) => [
                styles.codexExportButton,
                pressed && styles.secondaryButtonPressed,
                (!session || isRemoteBusy) && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.secondaryButtonText}>生成 Codex 导出码</Text>
            </Pressable>
            {codexExport ? (
              <View style={styles.codexTokenRow}>
                <View>
                  <Text style={styles.codexTokenLabel}>导出码</Text>
                  <Text style={styles.codexToken}>{codexExport.token}</Text>
                </View>
                <Text style={styles.codexTokenMeta}>
                  {formatExportExpiry(codexExport.expiresAt)} 前有效
                </Text>
              </View>
            ) : null}
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

        {activeTab === 'plan' ? (
          <ItineraryGeneratorPanel
            guideCount={guideEntries.length}
            docCount={guideEntries.filter((entry) => entry.sourceUrl).length}
            onGenerate={handleGeneratePlanFromGuides}
          />
        ) : null}

        <View style={styles.composer}>
          <Text style={styles.sectionLabel}>{getComposerTitle(activeTab)}</Text>
          <TextInput
            value={draftTitle}
            onChangeText={setDraftTitle}
            placeholder={getTitlePlaceholder(activeTab)}
            placeholderTextColor="#8a94a6"
            style={styles.input}
          />
          {activeTab === 'idea' || activeTab === 'guide' ? (
            <>
              <View style={styles.inputLabelRow}>
                <Text style={styles.inputLabel}>
                  {activeTab === 'idea' ? '小红书 / 抖音链接' : '飞书文档链接'}
                </Text>
                <Text style={styles.inputMeta}>
                  {activeTab === 'idea' ? '图文/长文优先' : '粘贴分享链接'}
                </Text>
              </View>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                value={draftUrl}
                onChangeText={handleDraftUrlChange}
                placeholder={
                  activeTab === 'idea'
                    ? '贴小红书/抖音链接；图文或长文更好整理'
                    : '粘贴飞书文档链接，比如 https://...'
                }
                placeholderTextColor="#8a94a6"
                style={[styles.input, styles.linkInput]}
              />
              <View style={styles.linkActionRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={activeTab === 'idea' ? handlePrepareInspirationLink : handlePrepareGuideDoc}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    styles.summaryButton,
                    pressed && styles.secondaryButtonPressed,
                  ]}
                >
                  <Text style={styles.secondaryButtonText}>
                    {activeTab === 'idea' ? '确认链接' : '关联文档'}
                  </Text>
                </Pressable>
                <Text style={styles.linkHint}>
                  {activeTab === 'idea'
                    ? '只保存链接；之后可让 Codex 读取内容再整理。'
                    : '保存文档来源，供行程生成引用。'}
                </Text>
              </View>
              {draftAiSummary ? <Text style={styles.aiSummaryPreview}>{draftAiSummary}</Text> : null}
            </>
          ) : null}
          <TextInput
            value={draftNote}
            onChangeText={setDraftNote}
            placeholder={getNotePlaceholder(activeTab)}
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
          {activeEntries.map((entry) => {
            const canDeleteEntry = isDeletableEntryKind(entry.kind);

            return (
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
                    <Text style={styles.aiSummaryLabel}>整理备注</Text>
                    <Text style={styles.aiSummaryText}>{entry.aiSummary}</Text>
                  </View>
                ) : null}
                <View style={styles.entryBottomRow}>
                  <Text style={styles.entryAuthor}>由 {entry.author} 添加</Text>
                  <View style={styles.entryMetaActions}>
                    <Text style={styles.entryMeta}>{entry.meta}</Text>
                    {canDeleteEntry ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`删除${kindLabels[entry.kind]}`}
                        disabled={isRemoteBusy}
                        onPress={() => confirmDeleteEntry(entry)}
                        style={({ pressed }) => [
                          styles.deleteEntryButton,
                          pressed && styles.deleteEntryButtonPressed,
                          isRemoteBusy && styles.buttonDisabled,
                        ]}
                      >
                        <Text style={styles.deleteEntryText}>删除</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </View>
            );
          })}
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
        <Text style={styles.updateMeta}>{appCapabilityVersion}</Text>
        <View style={styles.updateHelpBox}>
          <Text style={styles.updateHelpText}>{updateSuccessSignal}</Text>
          <Text style={styles.updateHelpText}>
            如果还显示“添加到灵感”，点检查更新；下载后必须点“重启更新”。
          </Text>
          <Text style={styles.updateHelpText}>
            仍无变化时，安装最新 Android preview APK。
          </Text>
        </View>
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

function DeleteConfirmModal({
  entry,
  onCancel,
  onConfirm,
}: {
  entry: CityEntry | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const kindLabel = entry ? kindLabels[entry.kind] : '记录';
  const syncScope =
    entry?.remoteId && entry.syncStatus === 'synced'
      ? '这条记录已同步，确认后会先尝试删除共享空间里的记录。'
      : '确认后会从当前城市里删除。';

  return (
    <Modal
      animationType="fade"
      onRequestClose={onCancel}
      transparent
      visible={Boolean(entry)}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.confirmDialog}>
          <Text style={styles.confirmTitle}>删除{kindLabel}？</Text>
          <Text style={styles.confirmText}>
            确定删除「{entry ? clipText(entry.title, 22) : ''}」吗？删除后不能在 app 内恢复。
          </Text>
          <Text style={styles.confirmHint}>{syncScope}</Text>
          <View style={styles.confirmActions}>
            <Pressable
              accessibilityRole="button"
              onPress={onCancel}
              style={({ pressed }) => [
                styles.cancelDeleteButton,
                pressed && styles.secondaryButtonPressed,
              ]}
            >
              <Text style={styles.cancelDeleteText}>取消</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onConfirm}
              style={({ pressed }) => [
                styles.confirmDeleteButton,
                pressed && styles.confirmDeleteButtonPressed,
              ]}
            >
              <Text style={styles.confirmDeleteText}>删除</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
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
        <Text style={styles.generatorWarning}>
          仅建议主整理人使用：灵感未核对前，朋友不要随手生成攻略。
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

function ItineraryGeneratorPanel({
  guideCount,
  docCount,
  onGenerate,
}: {
  guideCount: number;
  docCount: number;
  onGenerate: () => void;
}) {
  const hasGuides = guideCount > 0;

  return (
    <View style={styles.generatorPanel}>
      <View style={styles.generatorCopy}>
        <Text style={styles.sectionLabel}>行程生成</Text>
        <Text style={styles.generatorText}>
          {hasGuides
            ? `已有 ${guideCount} 条攻略，其中 ${docCount} 条关联了文档，可以生成行程草稿。`
            : '先在攻略里上传飞书文档或添加攻略草稿，再生成行程。'}
        </Text>
        <Text style={styles.generatorWarning}>
          仅建议主整理人使用：攻略和日期未确认前，朋友不要随手生成行程。
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={!hasGuides}
        onPress={onGenerate}
        style={({ pressed }) => [
          styles.generatorButton,
          pressed && styles.primaryButtonPressed,
          !hasGuides && styles.buttonDisabled,
        ]}
      >
        <Text style={styles.primaryButtonText}>按攻略生成行程</Text>
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

  if (activeTab === 'guide') {
    return '添加攻略';
  }

  if (activeTab === 'plan') {
    return '添加行程';
  }

  return `添加到${kindLabels[activeTab]}`;
}

function getTitlePlaceholder(activeTab: EntryKind) {
  if (activeTab === 'idea') {
    return '标题，可不填，比如 喀什咖啡店';
  }

  if (activeTab === 'guide') {
    return '攻略标题，可不填，比如 飞书攻略文档';
  }

  if (activeTab === 'plan') {
    return '行程标题，比如 Day 1 喀什';
  }

  return '标题';
}

function getNotePlaceholder(activeTab: EntryKind) {
  if (activeTab === 'idea') {
    return '可补一句：为什么想去 / 视频里提到什么';
  }

  if (activeTab === 'guide') {
    return '补充攻略重点，或粘贴飞书文档里的关键段落';
  }

  if (activeTab === 'plan') {
    return '写每天安排、交通、住宿和待确认事项';
  }

  return '记录一点细节';
}

function UsageGuide() {
  return (
    <View style={styles.guidePanel}>
      <Text style={styles.sectionLabel}>使用说明</Text>
      <Text style={styles.guideText}>1. 首页先建城市卡片，比如新疆、广西。</Text>
      <Text style={styles.guideText}>2. 点进城市后，把内容分到灵感、攻略、行程、回忆。</Text>
      <Text style={styles.guideText}>3. 灵感页只收集小红书或抖音链接，保存后可以让 Codex 读取内容再整理。</Text>
      <Text style={styles.guideText}>4. 图文或长文更容易整理地点、路线、价格和注意事项；短视频最好补一句重点。</Text>
      <Text style={styles.guideText}>5. 灵感和攻略卡片底部可以删除；已同步内容需要登录后删除。</Text>
      <Text style={styles.guideText}>6. 攻略和行程生成建议只由主整理人操作，朋友先负责收集和补充。</Text>
      <Text style={styles.guideText}>7. 如果仍看到“添加到灵感”，说明还在旧版本；回到顶部检查更新或安装新版 APK。</Text>
      <Text style={styles.guideText}>8. 登录后可以同步当前城市，再用邀请码邀请朋友加入。</Text>
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

function formatExportExpiry(expiresAt: string) {
  const expiryDate = new Date(expiresAt);

  if (Number.isNaN(expiryDate.getTime())) {
    return '15 分钟内';
  }

  const hours = String(expiryDate.getHours()).padStart(2, '0');
  const minutes = String(expiryDate.getMinutes()).padStart(2, '0');

  return `${hours}:${minutes}`;
}

function isDeletableEntryKind(kind: EntryKind) {
  return kind === 'idea' || kind === 'guide';
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

  if (activeTab === 'guide' && sourceUrl) {
    return `${getLinkSourceName(sourceUrl)} 攻略文档`;
  }

  if (activeTab === 'idea' && note) {
    const firstLine = note.split('\n')[0].trim();
    return firstLine.length > 18 ? `${firstLine.slice(0, 18)}...` : firstLine;
  }

  return '';
}

function getDraftNote(note: string, sourceUrl: string, activeTab: EntryKind) {
  if (note) {
    return note;
  }

  if (activeTab === 'idea' && sourceUrl) {
    return '先收进来，稍后整理地点、亮点和注意事项。';
  }

  if (activeTab === 'guide' && sourceUrl) {
    return `已关联 ${getLinkSourceName(sourceUrl)} 攻略文档，待核对日期、地点、交通、预约和预算。`;
  }

  return note;
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
  const sourceKind = getLinkSourceKind(sourceUrl);

  if (sourceKind === 'xiaohongshu') {
    return '小红书';
  }

  if (sourceKind === 'douyin') {
    return '抖音';
  }

  if (sourceKind === 'feishu') {
    return '飞书文档';
  }

  try {
    const host = new URL(sourceUrl).hostname.replace(/^www\./, '');
    return host;
  } catch {
    return '链接';
  }
}

function getLinkSourceKind(sourceUrl: string) {
  try {
    const host = new URL(sourceUrl).hostname.replace(/^www\./, '');

    if (host.includes('xiaohongshu') || host.includes('xhslink')) {
      return 'xiaohongshu';
    }

    if (host.includes('douyin') || host.includes('iesdouyin')) {
      return 'douyin';
    }

    if (host.includes('feishu') || host.includes('larksuite')) {
      return 'feishu';
    }
  } catch {
    return 'other';
  }

  return 'other';
}

function isSupportedInspirationLink(sourceUrl: string) {
  const sourceKind = getLinkSourceKind(sourceUrl);

  return sourceKind === 'xiaohongshu' || sourceKind === 'douyin';
}

function buildGuideDocSummaryDraft({
  city,
  note,
  rawSourceText,
  sourceUrl,
  title,
}: {
  city: CitySpace;
  note: string;
  rawSourceText: string;
  sourceUrl: string;
  title: string;
}) {
  const sourceName = getLinkSourceName(sourceUrl);
  const cleanShareText = getUsefulShareText(rawSourceText, sourceUrl);
  const signal = cleanShareText || title.trim() || note.trim() || `${city.title} 攻略文档`;

  return [
    `文档来源：${sourceName}`,
    `文档主题：${clipText(signal, 56)}`,
    '可用于生成：每日路线、交通衔接、住宿区域、预约/门票待办。',
    '待接入：服务端读取飞书正文后，自动抽取地点、时间和注意事项。',
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

function buildPlanDraftFromGuides(city: CitySpace, guides: CityEntry[], ideas: CityEntry[]) {
  const selectedGuides = [...guides]
    .sort((first, second) => Date.parse(first.createdAt) - Date.parse(second.createdAt))
    .slice(0, 10);
  const dayCount = Math.min(7, Math.max(1, selectedGuides.length));
  const inspirationAuthors = Array.from(new Set(ideas.map((entry) => entry.author))).slice(0, 4);
  const lines = [
    `目标：根据 ${city.title} 的 ${selectedGuides.length} 条攻略生成 ${dayCount} 天行程草稿。`,
    `攻略范围：${city.destination}`,
    inspirationAuthors.length
      ? `已参考灵感作者：${inspirationAuthors.join('、')}`
      : '已参考灵感作者：暂无同步灵感',
    '生成原则：每天地点尽量顺路，上午安排核心点，下午安排体验/移动，晚上留给吃饭和休息。',
    '',
  ];

  for (let index = 0; index < dayCount; index += 1) {
    const guide = selectedGuides[index];
    const backupGuide = selectedGuides[(index + 1) % selectedGuides.length] ?? guide;
    const sourceLabel = guide.sourceUrl ? `来源：${getLinkSourceName(guide.sourceUrl)}` : '来源：手写攻略';
    const guideSummary = guide.aiSummary || guide.note;

    lines.push(
      `Day ${index + 1}：${clipText(guide.title, 22)}`,
      `依据：${sourceLabel}`,
      `上午：按「${clipText(guide.title, 18)}」里的核心地点安排，先核对开放时间和预约。`,
      `下午：继续处理 ${clipText(guideSummary, 46)}，并把交通耗时留足。`,
      `晚上：围绕 ${clipText(backupGuide.title, 18)} 附近吃饭、散步或休息。`,
      '待确认：实际地址、营业时间、门票/预约、跨城交通、住宿位置。',
      '',
    );
  }

  lines.push('下一步：接入飞书正文读取后，可以把文档里的具体时间、地址和交通直接填进每天安排。');

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

const panelShadow = {
  shadowColor: '#1f2d3f',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.05,
  shadowRadius: 10,
  elevation: 1,
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#eef3f8',
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
    alignSelf: 'center',
    maxWidth: 720,
    paddingHorizontal: 16,
    paddingBottom: 36,
    paddingTop: 8,
    width: '100%',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  kicker: {
    color: '#4d6684',
    fontSize: 13,
    fontWeight: '800',
  },
  title: {
    color: '#152033',
    fontSize: 26,
    fontWeight: '900',
    lineHeight: 31,
    marginTop: 2,
  },
  shareBadge: {
    alignItems: 'center',
    backgroundColor: '#152033',
    borderRadius: 8,
    height: 42,
    justifyContent: 'center',
    minWidth: 58,
    paddingHorizontal: 12,
  },
  shareBadgeText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: '#e9eef6',
    borderRadius: 8,
    height: 42,
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
    borderColor: '#d7e1ec',
    borderRadius: 16,
    borderWidth: 1,
    color: '#526071',
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  updatePanel: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#dde7f2',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
    padding: 12,
    ...panelShadow,
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
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  updateMeta: {
    color: '#8792a3',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 4,
  },
  updateHelpBox: {
    backgroundColor: '#f8fafc',
    borderColor: '#d8e2ee',
    borderLeftWidth: 3,
    borderRadius: 6,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  updateHelpText: {
    color: '#526071',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  updateButton: {
    alignItems: 'center',
    backgroundColor: '#e9eef6',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 42,
    minWidth: 88,
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
    borderColor: '#dde7f2',
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
    ...panelShadow,
  },
  homeIntroTitle: {
    color: '#152033',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 24,
  },
  homeIntroText: {
    color: '#526071',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 21,
    marginTop: 6,
  },
  guidePanel: {
    backgroundColor: '#ffffff',
    borderColor: '#dde7f2',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 14,
    padding: 14,
    ...panelShadow,
  },
  guideText: {
    color: '#526071',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 20,
    marginTop: 4,
  },
  cityGrid: {
    gap: 10,
    marginTop: 14,
  },
  cityCard: {
    backgroundColor: '#ffffff',
    borderColor: '#dde7f2',
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
    ...panelShadow,
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
    fontSize: 21,
    fontWeight: '900',
    lineHeight: 27,
  },
  cityDestination: {
    color: '#647187',
    fontSize: 13,
    fontWeight: '600',
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
    gap: 7,
    marginTop: 12,
  },
  miniStat: {
    backgroundColor: '#f5f7fb',
    borderRadius: 8,
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 9,
  },
  miniStatValue: {
    color: '#152033',
    fontSize: 17,
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
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
    marginTop: 10,
  },
  cityPanel: {
    backgroundColor: '#ffffff',
    borderColor: '#dde7f2',
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
    ...panelShadow,
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
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 24,
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
    gap: 7,
  },
  statCard: {
    borderRadius: 8,
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 10,
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
    fontSize: 20,
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
    borderColor: '#dde7f2',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 16,
    padding: 14,
    ...panelShadow,
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
  codexExportSection: {
    borderColor: '#d8e2ee',
    borderTopWidth: 1,
    marginTop: 14,
    paddingTop: 14,
  },
  codexExportText: {
    color: '#526071',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
  codexExportButton: {
    alignItems: 'center',
    backgroundColor: '#e9eef6',
    borderRadius: 8,
    justifyContent: 'center',
    marginTop: 10,
    minHeight: 42,
    paddingHorizontal: 10,
  },
  codexTokenRow: {
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderColor: '#d8e2ee',
    borderLeftWidth: 3,
    borderRadius: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  codexTokenLabel: {
    color: '#7a8597',
    fontSize: 11,
    fontWeight: '800',
  },
  codexToken: {
    color: '#152033',
    fontSize: 17,
    fontWeight: '900',
    marginTop: 2,
  },
  codexTokenMeta: {
    color: '#526071',
    fontSize: 12,
    fontWeight: '700',
  },
  segmentedControl: {
    backgroundColor: '#dfe8f2',
    borderRadius: 8,
    flexDirection: 'row',
    marginTop: 16,
    padding: 3,
  },
  segmentButton: {
    alignItems: 'center',
    borderRadius: 7,
    flex: 1,
    minHeight: 38,
    justifyContent: 'center',
  },
  segmentButtonActive: {
    backgroundColor: '#ffffff',
  },
  segmentText: {
    color: '#526071',
    fontSize: 13,
    fontWeight: '800',
  },
  segmentTextActive: {
    color: '#152033',
  },
  generatorPanel: {
    alignItems: 'stretch',
    backgroundColor: '#ffffff',
    borderColor: '#dde7f2',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    marginTop: 12,
    padding: 14,
    ...panelShadow,
  },
  generatorCopy: {
    flex: 1,
  },
  generatorText: {
    color: '#526071',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  generatorWarning: {
    backgroundColor: '#fff7e6',
    borderColor: '#f0dca8',
    borderRadius: 8,
    borderWidth: 1,
    color: '#7a4c13',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  generatorButton: {
    alignItems: 'center',
    backgroundColor: '#152033',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  composer: {
    backgroundColor: '#ffffff',
    borderColor: '#dde7f2',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 16,
    padding: 14,
    ...panelShadow,
  },
  sectionLabel: {
    color: '#32445b',
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 8,
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
    fontWeight: '800',
  },
  inputMeta: {
    color: '#8792a3',
    fontSize: 12,
    fontWeight: '700',
  },
  input: {
    backgroundColor: '#f8fafc',
    borderColor: '#d8e2ee',
    borderRadius: 8,
    borderWidth: 1,
    color: '#172235',
    fontSize: 15,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 9,
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
    paddingHorizontal: 11,
    paddingVertical: 7,
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
    marginTop: 12,
    minHeight: 46,
  },
  joinButton: {
    alignItems: 'center',
    backgroundColor: '#152033',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
  },
  primaryButtonPressed: {
    backgroundColor: '#243247',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#e9eef6',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 10,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: '#e9eef6',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 42,
    width: 48,
  },
  secondaryButtonPressed: {
    backgroundColor: '#dfe7f1',
  },
  secondaryButtonText: {
    color: '#152033',
    fontSize: 13,
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
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(21, 32, 51, 0.38)',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  confirmDialog: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    maxWidth: 360,
    padding: 18,
    width: '100%',
    ...panelShadow,
  },
  confirmTitle: {
    color: '#152033',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 24,
  },
  confirmText: {
    color: '#48576b',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 21,
    marginTop: 10,
  },
  confirmHint: {
    color: '#7a4c13',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
    marginTop: 8,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  cancelDeleteButton: {
    alignItems: 'center',
    backgroundColor: '#e9eef6',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
  },
  cancelDeleteText: {
    color: '#152033',
    fontSize: 14,
    fontWeight: '900',
  },
  confirmDeleteButton: {
    alignItems: 'center',
    backgroundColor: '#a23b31',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
  },
  confirmDeleteButtonPressed: {
    backgroundColor: '#842e27',
  },
  confirmDeleteText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
  listHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  sectionTitle: {
    color: '#152033',
    fontSize: 19,
    fontWeight: '900',
  },
  sectionCount: {
    color: '#647187',
    fontSize: 13,
    fontWeight: '700',
  },
  entryList: {
    gap: 10,
    marginTop: 10,
  },
  entryCard: {
    backgroundColor: '#ffffff',
    borderColor: '#dde7f2',
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
    ...panelShadow,
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
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  entryTitle: {
    color: '#172235',
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 23,
    marginTop: 10,
  },
  entryNote: {
    color: '#48576b',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 21,
    marginTop: 8,
  },
  sourceLink: {
    alignItems: 'center',
    backgroundColor: '#eef4fb',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
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
    marginTop: 9,
    padding: 9,
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
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  entryAuthor: {
    color: '#8792a3',
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    marginRight: 8,
  },
  entryMetaActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
  },
  deleteEntryButton: {
    backgroundColor: '#fde5e2',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  deleteEntryButtonPressed: {
    backgroundColor: '#f8d0cb',
  },
  deleteEntryText: {
    color: '#a23b31',
    fontSize: 12,
    fontWeight: '900',
  },
});
