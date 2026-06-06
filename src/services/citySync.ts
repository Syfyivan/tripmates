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
  source_url?: string | null;
  ai_summary?: string | null;
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
  const { error: entryError } = await client
    .from('city_entries')
    .upsert(
      entriesForCity.map((entry) =>
        mapLocalEntryToRemotePayload(entry, activeCity.id, session.user.id, true),
      ),
    );

  if (entryError) {
    if (!isSourceColumnError(entryError)) {
      throw entryError;
    }

    const { error: fallbackError } = await client
      .from('city_entries')
      .upsert(
        entriesForCity.map((entry) =>
          mapLocalEntryToRemotePayload(entry, activeCity.id, session.user.id, false),
        ),
      );

    if (fallbackError) {
      throw fallbackError;
    }
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

export async function deleteCityEntry(entry: CityEntry) {
  const client = requireSupabase();
  const { data, error } = await client
    .from('city_entries')
    .delete()
    .eq('id', entry.remoteId ?? entry.id)
    .eq('city_id', entry.cityId)
    .select('id');

  if (error) {
    throw error;
  }

  if (!data?.length) {
    throw new Error('远端记录没有删除成功，请确认已在 Supabase 跑删除权限 SQL。');
  }
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

  const entries = await fetchRemoteEntries(cityId, true);

  return {
    city: mapRemoteCity(city),
    entries,
  };
}

async function fetchRemoteEntries(cityId: string, includeSourceFields: boolean): Promise<CityEntry[]> {
  const client = requireSupabase();
  const sourceColumns = includeSourceFields ? ',source_url,ai_summary' : '';
  const { data, error } = await client
    .from('city_entries')
    .select(`id,city_id,kind,title,note${sourceColumns},tag,author_name,meta,created_at,updated_at`)
    .eq('city_id', cityId)
    .order('created_at', { ascending: false })
    .returns<RemoteEntryRow[]>();

  if (error) {
    if (includeSourceFields && isSourceColumnError(error)) {
      return fetchRemoteEntries(cityId, false);
    }

    throw error;
  }

  return (data ?? []).map(mapRemoteEntry);
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
    sourceUrl: row.source_url ?? undefined,
    aiSummary: row.ai_summary ?? undefined,
    tag: row.tag,
    author: row.author_name,
    meta: row.meta,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    syncStatus: 'synced',
  };
}

function mapLocalEntryToRemotePayload(
  entry: CityEntry,
  cityId: string,
  userId: string,
  includeSourceFields: boolean,
) {
  const payload = {
    id: entry.remoteId ?? entry.id,
    city_id: cityId,
    kind: entry.kind,
    title: entry.title,
    note: entry.note,
    tag: entry.tag,
    author_name: entry.author,
    author_user_id: userId,
    meta: entry.meta,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  };

  if (!includeSourceFields) {
    return payload;
  }

  return {
    ...payload,
    source_url: entry.sourceUrl ?? null,
    ai_summary: entry.aiSummary ?? null,
  };
}

function isSourceColumnError(error: { message?: string; details?: string; hint?: string }) {
  const text = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase();

  return text.includes('source_url') || text.includes('ai_summary') || text.includes('schema cache');
}
