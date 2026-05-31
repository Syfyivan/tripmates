import { LocalTripState, TripEntry, TripSpace } from '../types';

const now = '2026-05-31T00:00:00.000Z';

export const defaultTrip: TripSpace = {
  id: 'trip-kansai-2026',
  title: '关西小队旅行库',
  destination: '京都 / 大阪 / 奈良',
  dateRange: '2026 春',
  inviteCode: 'KANSAI26',
  members: ['Ivan', 'Mia', '小队', '我'],
  createdAt: now,
  updatedAt: now,
};

export const seedEntries: TripEntry[] = [
  {
    id: 'idea-1',
    tripId: defaultTrip.id,
    kind: 'idea',
    title: '岚山清晨散步',
    note: '把竹林、渡月桥和一家咖啡店放在同一条慢路线里，避开中午人流。',
    tag: '景点',
    author: 'Ivan',
    meta: '京都 · 备选',
    createdAt: now,
    updatedAt: now,
    syncStatus: 'local',
  },
  {
    id: 'guide-1',
    tripId: defaultTrip.id,
    kind: 'guide',
    title: '关西机场到京都',
    note: 'Haruka 适合直达京都站，提前看 ICOCA 套票和末班车时间。',
    tag: '交通',
    author: 'Mia',
    meta: '已核对',
    createdAt: now,
    updatedAt: now,
    syncStatus: 'local',
  },
  {
    id: 'plan-1',
    tripId: defaultTrip.id,
    kind: 'plan',
    title: 'Day 2 京都东山',
    note: '清水寺、二年坂、祇园连成半日线，下午留给鸭川和随机小店。',
    tag: '景点',
    author: 'Ivan',
    meta: '第 2 天',
    createdAt: now,
    updatedAt: now,
    syncStatus: 'local',
  },
  {
    id: 'memory-1',
    tripId: defaultTrip.id,
    kind: 'memory',
    title: '今日高光',
    note: '大家一致同意：雨后街灯下的鸭川，比攻略照片还好看。',
    tag: '高光',
    author: '小队',
    meta: '旅行后整理',
    createdAt: now,
    updatedAt: now,
    syncStatus: 'local',
  },
];

export const defaultLocalState: LocalTripState = {
  version: 1,
  activeTripId: defaultTrip.id,
  trips: [defaultTrip],
  entries: seedEntries,
};
