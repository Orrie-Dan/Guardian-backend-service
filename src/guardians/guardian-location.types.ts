export type GuardianLocationSource = 'presence' | 'history' | null;

export type GuardianCurrentLocation = {
  guardianId: string;
  latitude: string | null;
  longitude: string | null;
  speed: string | null;
  batteryLevel: number | null;
  recordedAt: string | null;
  source: GuardianLocationSource;
  connected: boolean;
  reachable: boolean;
};

export type GuardianLocationHistoryPoint = {
  id: string;
  latitude: string;
  longitude: string;
  speed: string | null;
  batteryLevel: number | null;
  recordedAt: string;
};
