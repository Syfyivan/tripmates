import AsyncStorage from '@react-native-async-storage/async-storage';

import { defaultLocalState } from '../data/seed';
import { LocalCityState } from '../types';

const LOCAL_STATE_KEY = 'tripmates:v2:city-library-state';

export async function loadLocalCityState(): Promise<LocalCityState> {
  const storedValue = await AsyncStorage.getItem(LOCAL_STATE_KEY);

  if (!storedValue) {
    return defaultLocalState;
  }

  const parsed = JSON.parse(storedValue) as Partial<LocalCityState>;

  if (
    parsed.version !== 2 ||
    !parsed.activeCityId ||
    !Array.isArray(parsed.cities) ||
    !Array.isArray(parsed.entries)
  ) {
    return defaultLocalState;
  }

  return {
    version: 2,
    activeCityId: parsed.activeCityId,
    cities: parsed.cities,
    entries: parsed.entries,
  };
}

export async function saveLocalCityState(state: LocalCityState) {
  await AsyncStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(state));
}

export async function resetLocalCityState() {
  await AsyncStorage.removeItem(LOCAL_STATE_KEY);
}
