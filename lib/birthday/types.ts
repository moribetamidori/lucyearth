export type BirthdayMemoryKind = 'tweet' | 'project';

export type BirthdayMedia = {
  type: 'image';
  src: string;
  alt: string;
};

export type BirthdayMemory = {
  id: string;
  kind: BirthdayMemoryKind;
  clusterId: string;
  title?: string;
  text: string;
  sourceUrl?: string;
  publishedAt?: string;
  media?: BirthdayMedia[];
};

export type BirthdayCluster = {
  id: string;
  name: string;
  shortName: string;
  description: string;
  color: string;
  sigil: string;
  position: [number, number, number];
  anchorProjectId: string;
  memoryIds: string[];
};

export type BirthdayDataset = {
  generatedAt: string;
  profile: {
    name: string;
    handle: string;
    bio: string;
    avatarUrl: string;
  };
  stats: {
    tweetCount: number;
    projectCount: number;
    note: string;
  };
  clusters: BirthdayCluster[];
  memories: BirthdayMemory[];
};
