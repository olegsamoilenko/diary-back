export type Level = 1 | 2 | 3 | 4 | 5;

export type EntryMetrics = {
  energy: Level | null;
  focus: Level | null;
  stress: Level | null;
  motivation: Level | null;
  sleepQuality: Level | null;
};
