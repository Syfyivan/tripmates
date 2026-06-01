import { Session } from '@supabase/supabase-js';

import { LocalCityState, CityEntry, CitySpace } from '../types';
import { supabase } from './supabaseClient';

type RemoteCityRow = {
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
  city_id: string;
  kind: CityEntry['kind'];
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

export async function pushActiveCity(state: LocalCityState, session: Session) {
  const client = requireSupabase();
  const activeCity = state.cities.find((city) => city.id === state.activeCityId);

  if (!activeCity) {
    throw new Error('没有找到当前城市空间。');
  }

  const now = new Date().toISOString();
  const { error: cityError } = await client.from('cities').upsert({
    id: activeCity.id,
    title: activeCity.title,
    destination: activeCity.destination,
    date_range: activeCity.dateRange,
    invite_code: activeCity.inviteCode,
    member_names: activeCity.members,
    owner_id: session.user.id,
    updated_at: now,
  });

  if (cityError) {
    throw cityError;
  }

  const entriesForCity = state.entries.filter((entry) => entry.cityId === activeCity.id);
  const { error: entryError } = await client.from('city_entries').upsert(
    entriesForCity.map((entry) => ({
      id: entry.remoteId ?? entry.id,
      city_id: activeCity.id,
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
    cities: state.cities.map((city) =>
      city.id === activeCity.id ? { ...city, remoteId: activeCity.id, updatedAt: now } : city,
    ),
    entries: state.entries.map((entry) =>
      entry.cityId === activeCity.id
        ? { ...entry, remoteId: entry.remoteId ?? entry.id, syncStatus: 'synced' as const }
        : entry,
    ),
  };
}

export async function joinCityByInvite(inviteCode: string) {
  const client = requireSupabase();
  const code = inviteCode.trim().toUpperCase();
  const { data: joinedCityId, error: joinError } = await client.rpc('join_city_by_invite', {
    invite_code_input: code,
  });

  if (joinError) {
    throw joinError;
  }

  if (typeof joinedCityId !== 'string') {
    throw new Error('邀请码没有返回有效的城市空间。');
  }

  return fetchRemoteCity(joinedCityId);
}

async function fetchRemoteCity(cityId: string) {
  const client = requireSupabase();
  const { data: city, error: cityError } = await client
    .from('cities')
    .select('id,title,destination,date_range,invite_code,member_names,created_at,updated_at')
    .eq('id', cityId)
    .single<RemoteCityRow>();

  if (cityError) {
    throw cityError;
  }

  const { data: entries, error: entryError } = await client
    .from('city_entries')
    .select('id,city_id,kind,title,note,tag,author_name,meta,created_at,updated_at')
    .eq('city_id', cityId)
    .order('created_at', { ascending: false })
    .returns<RemoteEntryRow[]>();

  if (entryError) {
    throw entryError;
  }

  return {
    city: mapRemoteCity(city),
    entries: (entries ?? []).map(mapRemoteEntry),
  };
}

function mapRemoteCity(row: RemoteCityRow): CitySpace {
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

function mapRemoteEntry(row: RemoteEntryRow): CityEntry {
  return {
    id: row.id,
    remoteId: row.id,
    cityId: row.city_id,
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
