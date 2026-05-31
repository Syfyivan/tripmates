import AsyncStorage from '@react-native-async-storage/async-storage';

import { defaultLocalState } from '../data/seed';
import { LocalTripState } from '../types';

const LOCAL_STATE_KEY = 'tripmates:v2:city-library-state';

export async function loadLocalTripState(): Promise<LocalTripState> {
  const storedValue = await AsyncStorage.getItem(LOCAL_STATE_KEY);

  if (!storedValue) {
    return defaultLocalState;
  }

  const parsed = JSON.parse(storedValue) as Partial<LocalTripState>;

  if (
    parsed.version !== 2 ||
    !parsed.activeTripId ||
    !Array.isArray(parsed.trips) ||
    !Array.isArray(parsed.entries)
  ) {
    return defaultLocalState;
  }

  return {
    version: 2,
    activeTripId: parsed.activeTripId,
    trips: parsed.trips,
    entries: parsed.entries,
  };
}

export async function saveLocalTripState(state: LocalTripState) {
  await AsyncStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(state));
}

export async function resetLocalTripState() {
  await AsyncStorage.removeItem(LOCAL_STATE_KEY);
}
