import { Session } from '@supabase/supabase-js';

import { LocalTripState, TripEntry, TripSpace } from '../types';
import { supabase } from './supabaseClient';

type RemoteTripRow = {
  id: string;
  title: string;
  destination: string;
  date_range: string;
  invite_code: string;
  member_names: string[] | null;
  created_at: string;
  updated_at: string;
};

type RemoteEntryRow = {
  id: string;
  trip_id: string;
  kind: TripEntry['kind'];
  title: string;
  note: string;
  tag: string;
  author_name: string;
  meta: string;
  created_at: string;
  updated_at: string;
};

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase 还没有配置。请先设置 EXPO_PUBLIC_SUPABASE_URL 和 EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY。');
  }

  return supabase;
}

export async function getCurrentSession() {
  const client = requireSupabase();
  const { data, error } = await client.auth.getSession();

  if (error) {
    throw error;
  }

  return data.session;
}

export function subscribeToAuthChanges(onSession: (session: Session | null) => void) {
  const client = requireSupabase();
  const {
    data: { subscription },
  } = client.auth.onAuthStateChange((_event, session) => {
    onSession(session);
  });

  return () => subscription.unsubscribe();
}

export async function sendLoginLink(email: string) {
  const client = requireSupabase();
  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
    },
  });

  if (error) {
    throw error;
  }
}

export async function signOut() {
  const client = requireSupabase();
  const { error } = await client.auth.signOut();

  if (error) {
    throw error;
  }
}

export async function pushActiveTrip(state: LocalTripState, session: Session) {
  const client = requireSupabase();
  const activeTrip = state.trips.find((trip) => trip.id === state.activeTripId);

  if (!activeTrip) {
    throw new Error('没有找到当前城市空间。');
  }

  const now = new Date().toISOString();
  const { error: tripError } = await client.from('trips').upsert({
    id: activeTrip.id,
    title: activeTrip.title,
    destination: activeTrip.destination,
    date_range: activeTrip.dateRange,
    invite_code: activeTrip.inviteCode,
    member_names: activeTrip.members,
    owner_id: session.user.id,
    updated_at: now,
  });

  if (tripError) {
    throw tripError;
  }

  const entriesForTrip = state.entries.filter((entry) => entry.tripId === activeTrip.id);
  const { error: entryError } = await client.from('trip_entries').upsert(
    entriesForTrip.map((entry) => ({
      id: entry.remoteId ?? entry.id,
      trip_id: activeTrip.id,
      kind: entry.kind,
      title: entry.title,
      note: entry.note,
      tag: entry.tag,
      author_name: entry.author,
      author_user_id: session.user.id,
      meta: entry.meta,
      created_at: entry.createdAt,
      updated_at: entry.updatedAt,
    })),
  );

  if (entryError) {
    throw entryError;
  }

  return {
    ...state,
    trips: state.trips.map((trip) =>
      trip.id === activeTrip.id ? { ...trip, remoteId: activeTrip.id, updatedAt: now } : trip,
    ),
    entries: state.entries.map((entry) =>
      entry.tripId === activeTrip.id
        ? { ...entry, remoteId: entry.remoteId ?? entry.id, syncStatus: 'synced' as const }
        : entry,
    ),
  };
}

export async function joinTripByInvite(inviteCode: string) {
  const client = requireSupabase();
  const code = inviteCode.trim().toUpperCase();
  const { data: joinedTripId, error: joinError } = await client.rpc('join_trip_by_invite', {
    invite_code_input: code,
  });

  if (joinError) {
    throw joinError;
  }

  if (typeof joinedTripId !== 'string') {
    throw new Error('邀请码没有返回有效的城市空间。');
  }

  return fetchRemoteTrip(joinedTripId);
}

async function fetchRemoteTrip(tripId: string) {
  const client = requireSupabase();
  const { data: trip, error: tripError } = await client
    .from('trips')
    .select('id,title,destination,date_range,invite_code,member_names,created_at,updated_at')
    .eq('id', tripId)
    .single<RemoteTripRow>();

  if (tripError) {
    throw tripError;
  }

  const { data: entries, error: entryError } = await client
    .from('trip_entries')
    .select('id,trip_id,kind,title,note,tag,author_name,meta,created_at,updated_at')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false })
    .returns<RemoteEntryRow[]>();

  if (entryError) {
    throw entryError;
  }

  return {
    trip: mapRemoteTrip(trip),
    entries: (entries ?? []).map(mapRemoteEntry),
  };
}

function mapRemoteTrip(row: RemoteTripRow): TripSpace {
  return {
    id: row.id,
    remoteId: row.id,
    title: row.title,
    destination: row.destination,
    dateRange: row.date_range,
    inviteCode: row.invite_code,
    members: row.member_names ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRemoteEntry(row: RemoteEntryRow): TripEntry {
  return {
    id: row.id,
    remoteId: row.id,
    tripId: row.trip_id,
    kind: row.kind,
    title: row.title,
    note: row.note,
    tag: row.tag,
    author: row.author_name,
    meta: row.meta,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    syncStatus: 'synced',
  };
}
