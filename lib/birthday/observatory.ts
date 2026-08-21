export type ObservatoryPlanetId =
  | 'mercury'
  | 'venus'
  | 'earth'
  | 'mars'
  | 'jupiter'
  | 'saturn'
  | 'uranus'
  | 'neptune'
  | 'pluto';

export type ObservatoryPlanet = {
  id: ObservatoryPlanetId;
  name: string;
  symbol: string;
  moons: readonly string[];
};

export const OBSERVATORY_PLANETS: readonly ObservatoryPlanet[] = [
  { id: 'mercury', name: 'MERCURY', symbol: '☿', moons: [] },
  { id: 'venus', name: 'VENUS', symbol: '♀', moons: [] },
  { id: 'earth', name: 'EARTH', symbol: '♁', moons: ['MOON'] },
  { id: 'mars', name: 'MARS', symbol: '♂', moons: ['PHOBOS', 'DEIMOS'] },
  {
    id: 'jupiter',
    name: 'JUPITER',
    symbol: '♃',
    moons: ['IO', 'EUROPA', 'GANYMEDE', 'CALLISTO'],
  },
  {
    id: 'saturn',
    name: 'SATURN',
    symbol: '♄',
    moons: ['MIMAS', 'ENCELADUS', 'TETHYS', 'DIONE', 'RHEA', 'TITAN', 'IAPETUS'],
  },
  {
    id: 'uranus',
    name: 'URANUS',
    symbol: '⛢',
    moons: ['MIRANDA', 'ARIEL', 'UMBRIEL', 'TITANIA', 'OBERON'],
  },
  {
    id: 'neptune',
    name: 'NEPTUNE',
    symbol: '♆',
    moons: ['PROTEUS', 'TRITON', 'NEREID'],
  },
  {
    id: 'pluto',
    name: 'PLUTO',
    symbol: '♇',
    moons: ['CHARON', 'STYX', 'NIX', 'KERBEROS', 'HYDRA'],
  },
];

export type ObservatoryLocation = {
  planetId: ObservatoryPlanetId;
  moonName?: string;
};

// The archive still uses clusters internally, but every visible destination is
// a real body in the solar-system model.
export const CLUSTER_LOCATIONS: Readonly<Record<string, ObservatoryLocation>> = {
  'autonomous-signals': { planetId: 'saturn' },
  'temporary-worlds': { planetId: 'mars' },
  'deliciously-broken-code': { planetId: 'saturn', moonName: 'IAPETUS' },
  'tools-for-thought': { planetId: 'mercury' },
  'desert-internet': { planetId: 'jupiter' },
  'coordination-machines': { planetId: 'saturn', moonName: 'DIONE' },
  'second-street': { planetId: 'pluto' },
};

export function getObservatoryDestination(clusterId: string) {
  const location = CLUSTER_LOCATIONS[clusterId];
  if (!location) return null;

  const planet = OBSERVATORY_PLANETS.find((candidate) => candidate.id === location.planetId);
  if (!planet) return null;

  return {
    ...location,
    planet,
    name: location.moonName ?? planet.name,
    symbol: location.moonName ? '·' : planet.symbol,
  };
}
