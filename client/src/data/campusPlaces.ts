/**
 * campusPlaces.ts — Official Campus Places, Rooms, POIs & Facilities Registry
 * Christ College (Autonomous), Irinjalakuda
 *
 * Mapped to physical 360° panorama nodes with verified coordinates & room metadata.
 * Unverified room numbers are explicitly flagged (verified: false) without hallucinating.
 */

import { AreaCode } from './campusGraph';

export type PlaceCategory = 'ACADEMICS' | 'SERVICES' | 'FACILITIES' | 'NAVIGATION';

export type PlaceSubCategory =
  | 'DEPARTMENT'
  | 'CLASSROOM'
  | 'LAB'
  | 'SEMINAR_HALL'
  | 'LIBRARY'
  | 'ADMINISTRATION'
  | 'FACULTY_ROOM'
  | 'SICK_ROOM'
  | 'SECURITY'
  | 'TOILET'
  | 'WASHROOM'
  | 'CANTEEN'
  | 'WATER'
  | 'PARKING'
  | 'ENTRANCE'
  | 'EXIT'
  | 'STAIRS'
  | 'LIFT'
  | 'RAMP'
  | 'SPORTS'
  | 'CHAPEL'
  | 'FACILITY';

export interface CampusPlace {
  id: string;
  name: string;
  category: PlaceCategory;
  subCategory: PlaceSubCategory;
  building: AreaCode;
  buildingName: string;
  floor: string; // e.g. "Ground Floor", "1st Floor", "2nd Floor", "3rd Floor"
  floorNumber: number; // 0, 1, 2, 3
  roomNumber: string | null; // null if unverified or not a numbered room
  panoramaNodeId: string; // ID of the panorama node where this place is visible/located
  /** 3D Look Direction in panorama for floating POI marker */
  position3D: {
    yaw: number; // 0-360 degrees
    pitch: number; // vertical tilt (-30 to +30)
    distanceMeters: number;
  };
  verified: boolean;
  notes?: string;
  icon: string;
  aliases: string[];
}

export interface BuildingFloorInfo {
  code: AreaCode;
  name: string;
  fullName: string;
  floors: {
    floorNumber: number;
    label: string;
    shortLabel: string;
    description: string;
  }[];
}

export const CAMPUS_BUILDING_FLOORS: Record<AreaCode, BuildingFloorInfo> = {
  OUTDOOR: {
    code: 'OUTDOOR',
    name: 'Campus Grounds',
    fullName: 'Outdoor Grounds & Avenues',
    floors: [{ floorNumber: 0, label: 'Ground Level', shortLabel: 'G', description: 'Walkways, Plazas & Main Avenues' }],
  },
  MG: {
    code: 'MG',
    name: 'MG Block',
    fullName: 'Mahatma Gandhi Heritage Block',
    floors: [
      { floorNumber: 0, label: 'Ground Floor', shortLabel: 'G', description: 'Chemistry, Physics Labs & Sick Room' },
      { floorNumber: 1, label: '1st Floor', shortLabel: '1', description: 'Computer Science Dept & CS Labs' },
      { floorNumber: 2, label: '2nd Floor', shortLabel: '2', description: 'Mathematics Dept & Senior Classrooms' },
      { floorNumber: 3, label: '3rd Floor', shortLabel: '3', description: 'Auditorium Gallery & Seminar Wings' },
    ],
  },
  AB: {
    code: 'AB',
    name: 'Administrative Block',
    fullName: 'Administrative Block (AB)',
    floors: [
      { floorNumber: 0, label: 'Ground Floor', shortLabel: 'G', description: "Principal's Office, Administration & Accounts" },
      { floorNumber: 1, label: '1st Floor', shortLabel: '1', description: 'Controller of Examinations & Council Hall' },
      { floorNumber: 2, label: '2nd Floor', shortLabel: '2', description: 'IQAC Cell & Conference Rooms' },
    ],
  },
  SM: {
    code: 'SM',
    name: 'St. Mary Block',
    fullName: 'St. Mary Block (SM)',
    floors: [
      { floorNumber: 0, label: 'Ground Floor', shortLabel: 'G', description: 'Commerce Department & Faculty Rooms (sm_001–sm_003)' },
      { floorNumber: 1, label: '1st Floor', shortLabel: '1', description: 'Economics Department & Language Labs (sm_004–sm_006)' },
      { floorNumber: 2, label: '2nd Floor', shortLabel: '2', description: 'Smart Classrooms & Discussion Rooms (sm_007–sm_009)' },
    ],
  },
  SJ: {
    code: 'SJ',
    name: "St. Joseph's Block",
    fullName: "St. Joseph's Block (SJ)",
    floors: [
      { floorNumber: 0, label: 'Ground Floor', shortLabel: 'G', description: 'Botany Department, Herbarium & Biotech Labs' },
      { floorNumber: 1, label: '1st Floor', shortLabel: '1', description: 'Zoology Department & Natural History Museum' },
      { floorNumber: 2, label: '2nd Floor', shortLabel: '2', description: 'Environmental Science & Research Labs' },
      { floorNumber: 3, label: '3rd Floor', shortLabel: '3', description: 'PG Classrooms & Speciality Labs' },
    ],
  },
  SC: {
    code: 'SC',
    name: 'St. Chavara Block',
    fullName: 'St. Chavara Block (SC)',
    floors: [
      { floorNumber: 0, label: 'Ground Floor', shortLabel: 'G', description: 'Psychology, Social Work Dept & Main Seminar Hall' },
      { floorNumber: 1, label: '1st Floor', shortLabel: '1', description: 'Postgraduate Studies & Research Center' },
      { floorNumber: 2, label: '2nd Floor', shortLabel: '2', description: 'Multimedia Center & Faculty Research Rooms' },
    ],
  },
  HM: {
    code: 'HM',
    name: 'Hotel Management Block',
    fullName: 'Hotel Management & Catering Block',
    floors: [
      { floorNumber: 0, label: 'Ground Floor', shortLabel: 'G', description: 'Culinary Labs, Training Restaurant & Production Kitchen' },
    ],
  },
  MT: {
    code: 'MT',
    name: 'Mother Teresa Block',
    fullName: 'Mother Teresa Block (MT)',
    floors: [
      { floorNumber: 0, label: 'Ground Floor', shortLabel: 'G', description: 'Social Science Classrooms, Faculty Chambers & Seminar Hall' },
    ],
  },
  SB: {
    code: 'SB',
    name: 'Sneha Bhavan Block (SB Block)',
    fullName: 'Sneha Bhavan Block (SB)',
    floors: [
      { floorNumber: 0, label: 'Ground Floor', shortLabel: 'G', description: 'Department of Social Work, Innovation Centre, Sannidhi, Library & Classrooms' },
      { floorNumber: 1, label: '1st Floor', shortLabel: '1', description: 'Conference Hall, Computer Lab, Social Work Research Centre' },
    ],
  },
  BBA: {
    code: 'BBA',
    name: 'BBA Block',
    fullName: 'BBA & Management Studies Block',
    floors: [
      { floorNumber: 0, label: 'Ground Floor', shortLabel: 'G', description: 'BBA Classrooms & Faculty Rooms' },
      { floorNumber: 1, label: '1st Floor', shortLabel: '1', description: 'Management Lecture Halls' },
    ],
  },
  GB: {
    code: 'GB',
    name: 'Gabriel Block',
    fullName: 'Fr. Gabriel Indoor Stadium & St. Sebastian Block (GB / BPE)',
    floors: [
      { floorNumber: 0, label: 'Ground Floor', shortLabel: 'G', description: 'Physical Education Classrooms (I-IV B.P.E), MPES Room, Dean Affairs & Sports Arena' },
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// OFFICIAL CAMPUS PLACES & POI DATASET
// ═══════════════════════════════════════════════════════════════════════════

export const CAMPUS_PLACES: CampusPlace[] = [
  // ─── ACADEMICS & DEPARTMENTS (VERIFIED PHYSICAL TAGS) ───
  {
    id: 'place_social_work_dept',
    name: 'Department of Social Work',
    category: 'ACADEMICS',
    subCategory: 'DEPARTMENT',
    building: 'SB',
    buildingName: 'Sneha Bhavan Block',
    floor: 'Ground Floor',
    floorNumber: 0,
    roomNumber: null,
    panoramaNodeId: 'sb_454',
    position3D: { yaw: 317, pitch: 0, distanceMeters: 5 },
    verified: true,
    notes: 'Department of Social Work (BSW, MSW), Faculty Room & HOD Chamber',
    icon: '🤝',
    aliases: ['Social Work', 'Social Work Dept', 'BSW', 'MSW', 'Dr Asha P Rao', 'Sneha Bhavan Social Work', 'Dept of Social Work'],
  },
  {
    id: 'place_physical_edu_dept',
    name: 'Department of Physical Education (B.P.E)',
    category: 'ACADEMICS',
    subCategory: 'DEPARTMENT',
    building: 'GB',
    buildingName: 'St. Sebastian Block (BPE Block)',
    floor: 'Ground Floor',
    floorNumber: 0,
    roomNumber: null,
    panoramaNodeId: 'gb_352',
    position3D: { yaw: 286, pitch: 2, distanceMeters: 5 },
    verified: true,
    notes: 'Physical Education Department, MPES Room & BPE Faculty Chambers',
    icon: '🏃',
    aliases: ['Physical Education', 'BPE Department', 'BPE Dept', 'B.P.E', 'MPES Room', 'St Sebastian Block', 'BPE Block', 'Sports Wing'],
  },
  {
    id: 'place_english_dept',
    name: 'Department of English',
    category: 'ACADEMICS',
    subCategory: 'DEPARTMENT',
    building: 'MG',
    buildingName: 'Mahatma Gandhi Block',
    floor: '2nd Floor',
    floorNumber: 2,
    roomNumber: null,
    panoramaNodeId: 'mg_295',
    position3D: { yaw: 304, pitch: 11, distanceMeters: 5 },
    verified: true,
    notes: 'Aided English Department, Faculty Chamber & Staff Room',
    icon: '📚',
    aliases: [
      'English Department',
      'Dept of English',
      'English Staff Room',
      'Dr. K.J. Vargheese',
      'Shinto V.P.',
      'Dr. Anusha Mathew',
      'Dr. Stenza Augustine',
      'Bibin Thomas',
      'BA English',
      'MA English',
      'English Literature',
      'English'
    ],
  },
  {
    id: 'place_english_history_dept',
    name: 'Department of English & History (Unaided)',
    category: 'ACADEMICS',
    subCategory: 'DEPARTMENT',
    building: 'BBA',
    buildingName: 'BBA Block',
    floor: '3rd Floor',
    floorNumber: 3,
    roomNumber: null,
    panoramaNodeId: 'bba_374',
    position3D: { yaw: 304, pitch: 5, distanceMeters: 5 },
    verified: true,
    notes: 'Self-Financing English & History Double Main Department',
    icon: '📖',
    aliases: ['English & History', 'English History Dept', 'Double Main English', 'BA English and History', 'English Unaided'],
  },
  {
    id: 'place_english_research_centre',
    name: 'Centre for Research in English',
    category: 'ACADEMICS',
    subCategory: 'LAB',
    building: 'SJ',
    buildingName: "St. Joseph's Block",
    floor: '1st Floor',
    floorNumber: 1,
    roomNumber: null,
    panoramaNodeId: 'sj_169',
    position3D: { yaw: 249, pitch: 7, distanceMeters: 6 },
    verified: true,
    notes: 'Advanced Research Centre in English Language & Literature',
    icon: '🔬',
    aliases: ['Centre for Research in English', 'English Research Centre', 'English Research Lab', 'Research in English', 'Cantre for Research in English'],
  },
  {
    id: 'place_zoology_dept',
    name: 'Natural History Museum',
    category: 'ACADEMICS',
    subCategory: 'LAB',
    building: 'SJ',
    buildingName: "St. Joseph's Block",
    floor: '2nd Floor',
    floorNumber: 2,
    roomNumber: null,
    panoramaNodeId: 'sj_195',
    position3D: { yaw: 180, pitch: 0, distanceMeters: 5 },
    verified: true,
    notes: 'Zoology Natural History Museum and Specimen Repository',
    icon: '🏛️',
    aliases: ['Zoology Museum', 'Natural Museum', 'Museum', 'Specimen Museum'],
  },

  // ─── ADMINISTRATIVE OFFICES (VERIFIED PHYSICAL TAGS) ───
  {
    id: 'place_principal_office',
    name: "Principal's Office",
    category: 'SERVICES',
    subCategory: 'ADMINISTRATION',
    building: 'AB',
    buildingName: 'Administrative Block',
    floor: 'Ground Floor',
    floorNumber: 0,
    roomNumber: null,
    panoramaNodeId: 'ab_063',
    position3D: { yaw: 90, pitch: 0, distanceMeters: 6 },
    verified: true,
    notes: 'Office of the Principal, Christ College',
    icon: '🏛️',
    aliases: ["Principal Office", "Principal Room", "Head of Institution", "Fr. Principal"],
  },
  {
    id: 'place_bursar_office',
    name: "Bursar's Office",
    category: 'SERVICES',
    subCategory: 'ADMINISTRATION',
    building: 'AB',
    buildingName: 'Administrative Block',
    floor: 'Ground Floor',
    floorNumber: 0,
    roomNumber: null,
    panoramaNodeId: 'ab_064',
    position3D: { yaw: 180, pitch: 0, distanceMeters: 5 },
    verified: true,
    notes: 'Financial Management, Fees & Bursar Chamber',
    icon: '💼',
    aliases: ["Bursar Office", "Accounts & Bursar", "Finance Office", "Fr. Bursar"],
  },
  {
    id: 'place_dean_student_affairs',
    name: 'Dean of Faculty & Student Affairs',
    category: 'SERVICES',
    subCategory: 'ADMINISTRATION',
    building: 'GB',
    buildingName: 'St. Sebastian Block (BPE Block)',
    floor: 'Ground Floor',
    floorNumber: 0,
    roomNumber: null,
    panoramaNodeId: 'gb_332',
    position3D: { yaw: 215, pitch: 7, distanceMeters: 5 },
    verified: true,
    notes: 'Dean Office for Faculty and Student Affairs, Dr. Anilkumar N.',
    icon: '🏛️',
    aliases: ['Dean Student Affairs', 'Dean Affairs', 'Dr Anilkumar', 'Student Affairs Office'],
  },

  // ─── AMENITIES & FACILITIES (VERIFIED PHYSICAL TAGS) ───
  {
    id: 'place_innovation_centre',
    name: 'Christ Innovation Centre',
    category: 'FACILITIES',
    subCategory: 'FACILITY',
    building: 'SB',
    buildingName: 'Sneha Bhavan Block',
    floor: 'Ground Floor',
    floorNumber: 0,
    roomNumber: null,
    panoramaNodeId: 'sb_433',
    position3D: { yaw: 213, pitch: -2, distanceMeters: 5 },
    verified: true,
    notes: 'Incubation, Startups & Christ Innovation Lab',
    icon: '💡',
    aliases: ['Innovation Centre', 'Christ Innovation Centre', 'Innovation Lab', 'Startups Wing', 'Incubation Centre'],
  },
  {
    id: 'place_sannidhi',
    name: 'Sannidhi',
    category: 'SERVICES',
    subCategory: 'ADMINISTRATION',
    building: 'SB',
    buildingName: 'Sneha Bhavan Block',
    floor: 'Ground Floor',
    floorNumber: 0,
    roomNumber: null,
    panoramaNodeId: 'sb_444',
    position3D: { yaw: 42, pitch: 5, distanceMeters: 5 },
    verified: true,
    notes: 'Sannidhi Administrative Office & Community Counselling Wing',
    icon: '🏢',
    aliases: ['Sannidhi', 'Sannidhi Office', 'Sneha Bhavan Sannidhi'],
  },
  {
    id: 'place_sb_conference_hall',
    name: 'Conference Hall (Sneha Bhavan)',
    category: 'SERVICES',
    subCategory: 'SEMINAR_HALL',
    building: 'SB',
    buildingName: 'Sneha Bhavan Block',
    floor: '1st Floor',
    floorNumber: 1,
    roomNumber: null,
    panoramaNodeId: 'sb_456',
    position3D: { yaw: 47, pitch: 1, distanceMeters: 5 },
    verified: true,
    notes: 'Sneha Bhavan Conference & Seminar Hall',
    icon: '🎙️',
    aliases: ['SB Conference Hall', 'Conference Hall SB', 'Social Work Seminar Hall', 'Conference Hall'],
  },
  {
    id: 'place_store_room',
    name: 'General Store & Stationery',
    category: 'FACILITIES',
    subCategory: 'FACILITY',
    building: 'SB',
    buildingName: 'Sneha Bhavan Block',
    floor: 'Ground Floor',
    floorNumber: 0,
    roomNumber: null,
    panoramaNodeId: 'sb_431',
    position3D: { yaw: 180, pitch: 0, distanceMeters: 5 },
    verified: true,
    notes: 'Student Cooperative Store & Stationery Counter',
    icon: '🏪',
    aliases: ['Cooperative Store', 'Stationery Shop', 'College Store', 'Store', 'Book Stall'],
  },
  {
    id: 'place_table_tennis_academy',
    name: 'Table Tennis Academy',
    category: 'FACILITIES',
    subCategory: 'SPORTS',
    building: 'GB',
    buildingName: 'St. Sebastian Block (BPE Block)',
    floor: 'Ground Floor',
    floorNumber: 0,
    roomNumber: null,
    panoramaNodeId: 'gb_346',
    position3D: { yaw: 99, pitch: 22, distanceMeters: 5 },
    verified: true,
    notes: 'Indoor Table Tennis Academy & Sports Training Facility',
    icon: '🏓',
    aliases: ['Table Tennis Academy', 'Table Tennis', 'TT Academy', 'Indoor Sports Academy'],
  },
  {
    id: 'place_indoor_stadium',
    name: 'Fr. Gabriel Indoor Stadium',
    category: 'FACILITIES',
    subCategory: 'SPORTS',
    building: 'GB',
    buildingName: 'Fr. Gabriel Indoor Stadium',
    floor: 'Ground Floor',
    floorNumber: 0,
    roomNumber: null,
    panoramaNodeId: 'bba_364',
    position3D: { yaw: 0, pitch: 0, distanceMeters: 10 },
    verified: true,
    notes: 'Fr. Gabriel Indoor Stadium, Badminton Courts & Gymnasium',
    icon: '🏟️',
    aliases: ['Gabriel Stadium', 'Indoor Stadium', 'GB Stadium', 'Badminton Court Indoor', 'Gymnasium'],
  },
  {
    id: 'place_volleyball_court',
    name: 'Volleyball Court',
    category: 'FACILITIES',
    subCategory: 'SPORTS',
    building: 'OUTDOOR',
    buildingName: 'Outdoor Grounds',
    floor: 'Ground Level',
    floorNumber: 0,
    roomNumber: null,
    panoramaNodeId: 'outdoor_024',
    position3D: { yaw: 180, pitch: 0, distanceMeters: 15 },
    verified: true,
    notes: 'Standard Clay Volleyball Court',
    icon: '🏐',
    aliases: ['Volley Court', 'Sports Ground', 'Outdoor Court'],
  },
  {
    id: 'place_basketball_court',
    name: 'Basketball Court',
    category: 'FACILITIES',
    subCategory: 'SPORTS',
    building: 'OUTDOOR',
    buildingName: 'Outdoor Grounds',
    floor: 'Ground Level',
    floorNumber: 0,
    roomNumber: null,
    panoramaNodeId: 'outdoor_029',
    position3D: { yaw: 270, pitch: 0, distanceMeters: 15 },
    verified: true,
    notes: 'Regulation Basketball Court',
    icon: '🏀',
    aliases: ['BBall Court', 'Hoops', 'Outdoor Basketball'],
  },
  {
    id: 'place_auditorium',
    name: 'Main College Auditorium',
    category: 'SERVICES',
    subCategory: 'SEMINAR_HALL',
    building: 'OUTDOOR',
    buildingName: 'Auditorium Complex',
    floor: 'Ground Level',
    floorNumber: 0,
    roomNumber: null,
    panoramaNodeId: 'outdoor_028',
    position3D: { yaw: 90, pitch: 5, distanceMeters: 20 },
    verified: true,
    notes: 'Large Main Campus Assembly & Cultural Auditorium',
    icon: '🎭',
    aliases: ['Auditorium', 'Main Auditorium', 'College Hall', 'Assembly Hall'],
  },
  {
    id: 'place_central_library',
    name: 'Central Library',
    category: 'FACILITIES',
    subCategory: 'LIBRARY',
    building: 'OUTDOOR',
    buildingName: 'Central Library Building',
    floor: 'Ground Floor',
    floorNumber: 0,
    roomNumber: null,
    panoramaNodeId: 'outdoor_201',
    position3D: { yaw: 0, pitch: 0, distanceMeters: 10 },
    verified: true,
    notes: 'Central Reference Library, Periodicals & Digital Reading Room',
    icon: '📚',
    aliases: ['College Library', 'General Library', 'Reading Room', 'Reference Library', 'Digital Library', 'Library'],
  },
  {
    id: 'place_college_canteen',
    name: 'College Canteen & Cafeteria',
    category: 'FACILITIES',
    subCategory: 'CANTEEN',
    building: 'BBA',
    buildingName: 'Canteen Facility',
    floor: 'Ground Level',
    floorNumber: 0,
    roomNumber: null,
    panoramaNodeId: 'bba_382',
    position3D: { yaw: 180, pitch: 0, distanceMeters: 10 },
    verified: true,
    notes: 'Main Student & Staff Cafeteria, Dining & Refreshments',
    icon: '☕',
    aliases: ['Canteen', 'Cafeteria', 'College Cafeteria', 'Mess', 'Food Court', 'Snack Bar'],
  },
];

/** Lookup map: place ID -> CampusPlace */
export const CAMPUS_PLACES_MAP = new Map<string, CampusPlace>(
  CAMPUS_PLACES.map((p) => [p.id, p])
);

/** Get all places located in or visible from a specific panorama node */
export function getPlacesForNode(panoramaNodeId: string): CampusPlace[] {
  return CAMPUS_PLACES.filter((p) => p.panoramaNodeId === panoramaNodeId);
}

/** Search places by query string with intelligent relevance ranking */
export function searchCampusPlaces(query: string): CampusPlace[] {
  const cleanStr = (s: string) => s.toLowerCase().replace(/['’.]/g, '').replace(/[\-_]+/g, ' ').trim();
  const norm = cleanStr(query);
  if (!norm) return [];

  const scored: { place: CampusPlace; score: number }[] = [];

  for (const p of CAMPUS_PLACES) {
    let score = 0;
    const normName = cleanStr(p.name);
    const normBldName = cleanStr(p.buildingName);
    const normBldCode = cleanStr(p.building);
    const normRoom = p.roomNumber ? cleanStr(p.roomNumber) : '';
    const aliases = (p.aliases || []).map((a) => cleanStr(a));

    // 1. Exact matches (highest priority)
    if (normName === norm || aliases.some((a) => a === norm) || normBldCode === norm) {
      score = 100;
    } else if (normName.startsWith(norm) || aliases.some((a) => a.startsWith(norm))) {
      score = 90;
    } else if (
      new RegExp(`\\b${norm}\\b`, 'i').test(normName) ||
      aliases.some((a) => new RegExp(`\\b${norm}\\b`, 'i').test(a))
    ) {
      score = 85;
    } else if (normRoom && (normRoom === norm || normRoom.includes(norm))) {
      score = 80;
    } else if (norm.length >= 3 && (normName.includes(norm) || aliases.some((a) => a.includes(norm)))) {
      score = 70;
    } else if (norm.length >= 3 && (normBldName.includes(norm) || norm.includes(normBldName))) {
      score = 50;
    } else if (norm.length >= 2 && (normName.includes(norm) || aliases.some((a) => a.includes(norm)))) {
      score = 40;
    }

    if (score > 0) {
      scored.push({ place: p, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.place);
}
