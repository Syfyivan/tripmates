export type EntryKind = 'idea' | 'guide' | 'plan' | 'memory';

export type TripEntry = {
  id: string;
  tripId: string;
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

export type TripSpace = {
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

export type LocalTripState = {
  version: 1;
  activeTripId: string;
  trips: TripSpace[];
  entries: TripEntry[];
};
