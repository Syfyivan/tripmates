export type EntryKind = 'idea' | 'guide' | 'plan' | 'memory';

export type CityEntry = {
  id: string;
  cityId: string;
  kind: EntryKind;
  title: string;
  note: string;
  tag: string;
  author: string;
  meta: string;
  createdAt: string;
  updatedAt: string;
  remoteId?: string;
  syncStatus: 'local' | 'synced' | 'error';
};

export type CitySpace = {
  id: string;
  title: string;
  destination: string;
  dateRange: string;
  inviteCode: string;
  members: string[];
  createdAt: string;
  updatedAt: string;
  remoteId?: string;
};

export type LocalCityState = {
  version: 2;
  activeCityId: string;
  cities: CitySpace[];
  entries: CityEntry[];
};
