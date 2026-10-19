import type { CrewId } from '../engine/types';

export interface CrewInfo {
  id: CrewId;
  name: string;
  role: string;
  /** Radio callsign shown on calls and logs. */
  call: string;
  /** Room they are usually found in, and the camera that covers it. */
  room: string;
}

export const CREW: CrewInfo[] = [
  { id: 'mara', name: 'Mara Okafor', role: 'Chief engineer', call: 'OKAFOR', room: 'C3 POWER' },
  { id: 'ilya', name: 'Ilya Venn', role: 'Medic', call: 'VENN', room: 'C5 QUARTERS' },
  { id: 'teo', name: 'Teo Ramires', role: 'Diver', call: 'RAMIRES', room: 'C6 DIVE BAY' },
  { id: 'hana', name: 'Hana Sato', role: 'Geologist', call: 'SATO', room: 'C4 LAB' },
  { id: 'rook', name: 'Rook Adeyemi', role: 'Systems', call: 'ADEYEMI', room: 'C4 LAB' },
  { id: 'lise', name: 'Lise Brandt', role: 'Company liaison', call: 'BRANDT', room: 'C1 COMMAND' },
];

export const crewInfo = (id: CrewId) => CREW.find((c) => c.id === id)!;
