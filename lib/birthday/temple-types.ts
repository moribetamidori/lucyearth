import type { BirthdayMemory } from './types';

export type TempleInstallationKind =
  | 'transmission-canopy'
  | 'commons-game-table'
  | 'spaghetti-tapestry'
  | 'library-of-prompts'
  | 'machine-muses'
  | 'commitment-chandelier'
  | 'attention-carillon'
  | 'human-mirror';

export type TempleTweetMemory = Omit<BirthdayMemory, 'kind' | 'media'> & {
  kind: 'tweet';
  tweetType: 'post' | 'reply';
  inReplyToStatusId?: string;
  attachmentUrls: string[];
  attachmentAltText: string[];
  visualSeed: number;
};

export type TempleCluster = {
  id: string;
  name: string;
  shortName: string;
  description: string;
  color: string;
  sigil: string;
  featuredMemoryId: string;
  installation: TempleInstallationKind;
  memoryIds: string[];
};

export type TempleArchiveDataset = {
  generatedAt: string;
  profile: {
    name: string;
    handle: string;
    bio: string;
    avatarUrl: string;
  };
  stats: {
    tweetCount: number;
    postCount: number;
    replyCount: number;
    note: string;
  };
  clustering: {
    classifier: string;
    model?: string;
    seedVersion: number;
    methodology?: string;
  };
  clusters: TempleCluster[];
  memories: TempleTweetMemory[];
};

export type TempleZone = {
  id: string;
  architecturalName: string;
  shortName: string;
  description: string;
  sigil: string;
  clusterId: string | null;
  position: [number, number, number];
  spawn: [number, number, number];
  radius: number;
  revealPhase: number;
};

export type TempleConfiguration = {
  version: number;
  sanctumWord: string;
  zones: TempleZone[];
};

export type TempleLetter = {
  zoneId: string;
  letter: string;
};

export type TempleDataset = TempleArchiveDataset & {
  temple: TempleConfiguration;
};

export type TempleMaterialMode = 'wireframe' | 'pearl';

export type TempleFocus =
  | { kind: 'memory'; id: string }
  | { kind: 'letter'; id: string }
  | { kind: 'cake'; id: 'birthday-cake' }
  | { kind: 'telescope'; id: 'observatory-telescope' }
  | null;

export type MobileMovementInput = {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  lookX: number;
  lookY: number;
};
