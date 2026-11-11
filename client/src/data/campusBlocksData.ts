// Verified official mapping of campus block IDs to full college data from christcollegeijk.edu.in
// Dynamically populated with real user entered tags from getAllCustomPlaceTags & CAMPUS_GRAPH_MAP
import { getAllCustomPlaceTags, CAMPUS_GRAPH_MAP } from './campusGraph';

export interface BlockOfficer {
  role: string;
  name: string;
  room?: string;
  phone?: string;
  nodeId?: string;
  floorNumber?: number;
}

export interface BlockContactInfo {
  phone: string;
  principalPhone?: string;
  mobile?: string;
  email: string;
  hours: string;
  address: string;
}

export interface CampusBlockInfo {
  name: string;
  code: string;
  category: string;
  description: string;
  entranceNodeId: string;
  totalFloors: number;
  contactInfo?: BlockContactInfo;
  officers?: BlockOfficer[];
  servicesOffered?: string[];
  floors: {
    floorNumber: number;
    name: string;
    nodeId: string;
    description: string;
    departments?: string[];
    rooms?: { id: string; name: string; number: string; type: string; nodeId?: string; inCharge?: string }[];
  }[];
}

function extractRoomCode(text: string, roomId?: string): string {
  if (roomId) return roomId;
  const match = text.match(/\b([A-Z]{2,4}\s*\d{1,4}[A-Z]?)\b/i) || text.match(/\b(\d{1,4}[A-Z]?)\b/i);
  if (match) return match[1].toUpperCase();
  if (/physics/i.test(text)) return 'PHYS';
  if (/math/i.test(text)) return 'MATH';
  if (/stat/i.test(text)) return 'STAT';
  if (/chem/i.test(text)) return 'CHEM';
  if (/botan/i.test(text)) return 'BOT';
  if (/zool/i.test(text)) return 'ZOO';
  if (/commerc/i.test(text)) return 'COMM';
  if (/engl/i.test(text)) return 'ENG';
  if (/malay/i.test(text)) return 'MAL';
  if (/bvoc/i.test(text)) return 'BVOC';
  if (/lab/i.test(text)) return 'LAB';
  if (/principal/i.test(text)) return 'PRIN';
  if (/bursar/i.test(text)) return 'BUR';
  if (/office/i.test(text)) return 'OFF';
  if (/canteen/i.test(text)) return 'CANT';
  if (/toilet|restroom/i.test(text)) return 'REST';
  return text.slice(0, 7).toUpperCase().trim();
}

function resolveInCharge(text: string): string | undefined {
  const norm = text.toLowerCase();
  if (norm.includes('principal')) return 'Rev. Dr. Jolly Andrews CMI';
  if (norm.includes('bursar')) return 'Fr. Joy Peenikkaparambil CMI';
  if (norm.includes('mathematics')) return 'Dr. Seena V. (HOD)';
  if (norm.includes('physics')) return 'Dr. K. Y. Shaju (HOD)';
  if (norm.includes('chemistry')) return 'Dr. Tom Cherian (HOD)';
  if (norm.includes('botany')) return 'Dr. Tessy Paul P. (HOD)';
  if (norm.includes('zoology')) return 'Dr. Leyon Varghese (HOD)';
  if (norm.includes('commerce')) return 'Dr. K. O. Francis (HOD)';
  if (norm.includes('english')) return 'Dr. K. J. Varghese (HOD)';
  if (norm.includes('geology')) return 'Dr. Linto Alappat (HOD)';
  if (norm.includes('malayalam')) return 'Dr. C. V. Sudheer (HOD)';
  if (norm.includes('statistic')) return 'Dr. Mariyamma K. D. (HOD)';
  if (norm.includes('social work')) return 'Dr. Asha P. Rao (HOD)';
  if (norm.includes('bvoc')) return 'Ms. Francy T. L. (Coordinator)';
  if (norm.includes('iqac')) return 'Dr. Shinto K. G. (Coordinator)';
  if (norm.includes('cash counter') || norm.includes('accounts')) return 'Sri. Shaju Varghese (Jr. Supt.)';
  if (norm.includes('physical education')) return 'Sri. Bintu T. Kalyan (HOD)';
  if (norm.includes('dean')) return 'Deans Directorate';
  return undefined;
}

export function buildBlockFloorsFromUserTags(blockCode: string, defaultEntrance: string): CampusBlockInfo['floors'] {
  const allTagsMap = getAllCustomPlaceTags();
  const tagsList: Array<{ id: string; text: string; category?: string; nodeId: string; roomId?: string; floor: number }> = [];

  for (const [nodeId, tags] of Object.entries(allTagsMap)) {
    const node = CAMPUS_GRAPH_MAP.get(nodeId);
    const area = (node?.area || '').toUpperCase();
    const isMatchingBlock = area === blockCode || nodeId.toLowerCase().startsWith(blockCode.toLowerCase() + '_');
    if (!isMatchingBlock) continue;

    const rawFloor = node?.floor;
    let floor = 0;
    if (rawFloor && rawFloor !== 'null') {
      floor = parseInt(rawFloor, 10) || 0;
    }

    for (const t of tags || []) {
      const text = (t.text || t.label || '').trim();
      if (!text) continue;
      tagsList.push({
        id: t.id,
        text,
        category: t.category,
        nodeId,
        roomId: t.roomId,
        floor,
      });
    }
  }

  // Group tags by floor
  const floorsMap = new Map<number, typeof tagsList>();
  for (const t of tagsList) {
    if (!floorsMap.has(t.floor)) floorsMap.set(t.floor, []);
    floorsMap.get(t.floor)!.push(t);
  }

  const sortedFloorNums = Array.from(floorsMap.keys()).sort((a, b) => a - b);
  if (sortedFloorNums.length === 0) sortedFloorNums.push(0);

  return sortedFloorNums.map((flrNum) => {
    const tagsOnFloor = floorsMap.get(flrNum) || [];
    const firstNodeId = tagsOnFloor[0]?.nodeId || defaultEntrance;

    // Collect departments & offices on this floor
    const depts: string[] = [];
    for (const t of tagsOnFloor) {
      if (/department|office|principal|bursar|iqac|dean|hod|placement|centre/i.test(t.text)) {
        if (!depts.includes(t.text)) depts.push(t.text);
      }
    }

    const floorTitle =
      flrNum === 0
        ? 'Ground Floor'
        : flrNum === 1
        ? 'First Floor'
        : flrNum === 2
        ? 'Second Floor'
        : flrNum === 3
        ? 'Third Floor'
        : `Floor ${flrNum}`;

    const desc =
      depts.length > 0
        ? depts.slice(0, 3).join(' • ')
        : `${tagsOnFloor.length} classrooms & facilities`;

    const rooms = tagsOnFloor.map((t) => ({
      id: t.id,
      name: t.text,
      number: extractRoomCode(t.text, t.roomId),
      type: t.category || 'ROOM',
      nodeId: t.nodeId,
      inCharge: resolveInCharge(t.text),
    }));

    return {
      floorNumber: flrNum,
      name: `${floorTitle}`,
      nodeId: firstNodeId,
      description: desc,
      departments: depts,
      rooms,
    };
  });
}

const COMMON_CONTACT_INFO: BlockContactInfo = {
  phone: '0480 2825258',
  principalPhone: '0480 2820005',
  mobile: '+91 7907129338',
  email: 'office@christcollegeijk.edu.in',
  hours: 'Mon – Sat: 8:30 AM – 4:30 PM',
  address: 'Christ College (Autonomous), Irinjalakuda North, 680125, Thrissur, Kerala',
};

export const CAMPUS_BLOCKS_INFO: Record<string, CampusBlockInfo> = {
  bld_ab: {
    name: 'Administrative Block (Main Wing)',
    code: 'AB',
    category: 'Central Governance, Principal Chamber & Sciences',
    description: "The official administrative headquarters of Christ College (Autonomous), Irinjalakuda. Houses the Principal's Chamber, Central College Office, Junior Superintendent, Fee & Accounts Section, IQAC Directorate, and Controller of Examinations.",
    entranceNodeId: 'ab_044',
    totalFloors: 4,
    contactInfo: {
      phone: '0480 2825258',
      principalPhone: '0480 2820005',
      email: 'office@christcollegeijk.edu.in',
      hours: 'Mon – Fri: 8:30 AM – 4:30 PM | Sat: 8:30 AM – 1:30 PM',
      address: 'Central Administrative Wing, Christ College (Autonomous), Irinjalakuda - 680125',
    },
    officers: [
      { role: 'Principal', name: 'Dr. Fr. Jolly Andrews CMI', room: "Principal's Chamber (Room 101)", phone: '0480 2820005', nodeId: 'ab_063', floorNumber: 1 },
      { role: "Bursar", name: 'Fr. Joy Peenikkaparambil CMI', room: "Bursar's Office", phone: '0480 2825258', nodeId: 'ab_064', floorNumber: 1 },
      { role: 'IQAC Coordinator', name: 'Dr. Shinto K. G.', room: 'IQAC Directorate', phone: '0480 2825258', nodeId: 'ab_073', floorNumber: 1 },
      { role: 'Junior Superintendent', name: 'Sri. Shaju Varghese', room: 'Central Office (Floor 1)', phone: '0480 2825258', nodeId: 'ab_070', floorNumber: 1 },
      { role: 'HOD Physics', name: 'Dr. K. Y. Shaju', room: 'Department of Physics', phone: '0480 2825258', nodeId: 'ab_047', floorNumber: 0 },
      { role: 'HOD Mathematics', name: 'Dr. Seena V.', room: 'Department of Mathematics', phone: '0480 2825258', nodeId: 'ab_068', floorNumber: 1 },
      { role: 'HOD Statistics', name: 'Dr. Mariyamma K. D.', room: 'Department of Statistics', phone: '0480 2825258', nodeId: 'ab_081', floorNumber: 2 },
      { role: 'HOD Physical Education', name: 'Sri. Bintu T. Kalyan', room: 'Department of Physical Education', phone: '0480 2825258', nodeId: 'ab_049', floorNumber: 0 },
    ],
    servicesOffered: [
      'New Student Admissions & Certificate Verification',
      'Tuition & Examination Fee Payment (Cash / Online counter)',
      'Autonomous Degree Certificates & Marklists Distribution',
      'Transfer Certificate (TC) & Conduct Certificate Issuance',
      'Scholarships & Government Concession Processing',
      'University Liaison & Calicut University Verification Desk',
    ],
    floors: buildBlockFloorsFromUserTags('AB', 'ab_044'),
  },

  bld_main: {
    name: 'Mahatma Gandhi Block (MG Block)',
    code: 'MG',
    category: 'Humanities, Languages, Commerce & Research',
    description: 'Flagship academic block housing Commerce, English, Malayalam, Psychology departments, Zoology Museum and Research Centre.',
    entranceNodeId: 'outdoor_269',
    totalFloors: 3,
    contactInfo: {
      phone: '0480 2825258',
      principalPhone: '0480 2820005',
      email: 'cs@christcollegeijk.edu.in',
      hours: 'Mon – Fri: 8:30 AM – 4:30 PM | Sat: 8:30 AM – 1:30 PM',
      address: 'Mahatma Gandhi Block, Christ College (Autonomous), Irinjalakuda - 680125',
    },
    officers: [
      { role: 'HOD Commerce', name: 'Dr. K. O. Francis', room: 'Department of Commerce', nodeId: 'mg_287', floorNumber: 1 },
      { role: 'HOD English', name: 'Dr. K. J. Varghese', room: 'Department of English', nodeId: 'mg_295', floorNumber: 2 },
      { role: 'HOD Malayalam', name: 'Dr. C. V. Sudheer', room: 'Department of Malayalam', nodeId: 'mg_292', floorNumber: 2 },
      { role: 'HOD Psychology', name: 'Dr. Eveena Rosario', room: 'Department of Psychology', nodeId: 'mg_296', floorNumber: 2 },
    ],
    servicesOffered: ['Commerce Seminars', 'Language Labs', 'Psychological Counseling & Testing'],
    floors: buildBlockFloorsFromUserTags('MG', 'outdoor_269'),
  },

  bld_sj: {
    name: 'St. Joseph Science Block (SJ Block)',
    code: 'SJ',
    category: 'Life Sciences, Zoology & Research Laboratories',
    description: 'Houses Department of Zoology, History, Placement & HR Cell, Entomotaxonomy, and advanced life science research labs.',
    entranceNodeId: 'outdoor_191',
    totalFloors: 2,
    contactInfo: {
      phone: '0480 2825258',
      principalPhone: '0480 2820005',
      email: 'zoology@christcollegeijk.edu.in',
      hours: 'Mon – Fri: 8:30 AM – 4:30 PM | Sat: 8:30 AM – 1:30 PM',
      address: 'St. Joseph Science Block, Christ College (Autonomous), Irinjalakuda - 680125',
    },
    officers: [
      { role: 'HOD Zoology', name: 'Dr. Leyon Varghese', room: 'Department of Zoology', nodeId: 'sj_175', floorNumber: 0 },
      { role: 'HOD History', name: 'Dr. Jiji Paul S.', room: 'Department of History', nodeId: 'sj_195', floorNumber: 1 },
      { role: 'Placement Officer', name: 'Placement Cell', room: 'HRD / Placement Office', nodeId: 'sj_169', floorNumber: 0 },
    ],
    servicesOffered: ['Zoology Research & Natural History Museum', 'Campus Placements', 'Entomology Taxonomy Testing'],
    floors: buildBlockFloorsFromUserTags('SJ', 'outdoor_191'),
  },

  bld_sm: {
    name: "St. Mary's Block (SM Block)",
    code: 'SM',
    category: 'Commerce, Botany & Academic Classrooms',
    description: 'Houses Department of Botany, Department of Commerce classrooms, Commerce Research Lab, and Computer Labs.',
    entranceNodeId: 'outdoor_240',
    totalFloors: 2,
    contactInfo: {
      phone: '0480 2825258',
      principalPhone: '0480 2820005',
      email: 'commerce@christcollegeijk.edu.in',
      hours: 'Mon – Fri: 8:30 AM – 4:30 PM | Sat: 8:30 AM – 1:30 PM',
      address: "St. Mary's Commerce Block, Christ College (Autonomous), Irinjalakuda - 680125",
    },
    officers: [
      { role: 'HOD Botany', name: 'Dr. Tessy Paul P.', room: 'Department of Botany', nodeId: 'sm_243', floorNumber: 0 },
      { role: 'Commerce Faculty Coordinator', name: 'Commerce Faculty', room: 'Department of Commerce', nodeId: 'sm_248', floorNumber: 0 },
    ],
    servicesOffered: ['Botany Herbarium & Specimen Access', 'Commerce Research & Tally Analytics'],
    floors: buildBlockFloorsFromUserTags('SM', 'outdoor_240'),
  },

  bld_sc: {
    name: 'South Campus / Chavara Block (SC Block)',
    code: 'SC',
    category: 'Computer Science, B.Voc, Physics & Advanced Research',
    description: 'Premier technological hub housing Computer Science Labs, Department of B.Voc, Computational Physics Lab, and Central Server Room.',
    entranceNodeId: 'outdoor_203',
    totalFloors: 2,
    contactInfo: {
      phone: '0480 2825258',
      principalPhone: '0480 2820005',
      email: 'research@christcollegeijk.edu.in',
      hours: 'Mon – Fri: 8:30 AM – 5:00 PM | Sat: 8:30 AM – 1:30 PM',
      address: 'St. Chavara PG & Research Block, Christ College (Autonomous), Irinjalakuda - 680125',
    },
    officers: [
      { role: 'B.Voc Course Coordinator', name: 'Ms. Francy T. L.', room: 'Department of B.Voc', nodeId: 'sc_224', floorNumber: 1 },
      { role: 'Computer Science Lab In-Charge', name: 'Computer Science Department', room: 'Computer Lab', nodeId: 'sc_207', floorNumber: 0 },
      { role: 'Physics Research In-Charge', name: 'Physics Department', room: 'Computational Lab', nodeId: 'sc_211', floorNumber: 0 },
    ],
    servicesOffered: ['B.Voc Vocational Training', 'Computer Science Practicals', 'High Performance Server Infrastructure'],
    floors: buildBlockFloorsFromUserTags('SC', 'sc_205'),
  },

  bld_mt: {
    name: 'Mother Teresa Block (MT Block)',
    code: 'MT',
    category: 'Chemistry, Geology & Environmental Science',
    description: 'Comprehensive science complex housing Chemistry Department (Aided & Unaided), Geology & Environmental Science, and Computer Labs.',
    entranceNodeId: 'outdoor_143',
    totalFloors: 3,
    contactInfo: {
      phone: '0480 2825258',
      principalPhone: '0480 2820005',
      email: 'chemistry@christcollegeijk.edu.in',
      hours: 'Mon – Fri: 8:30 AM – 4:30 PM | Sat: 8:30 AM – 1:30 PM',
      address: 'Mother Teresa Block, Christ College (Autonomous), Irinjalakuda - 680125',
    },
    officers: [
      { role: 'HOD Chemistry', name: 'Dr. Tom Cherian / Dr. Rani Varghese', room: 'Department of Chemistry', nodeId: 'mt_115', floorNumber: 0 },
      { role: 'HOD Geology & Env. Science', name: 'Dr. Linto Alappat', room: 'Department of Geology', nodeId: 'mt_110', floorNumber: 1 },
      { role: 'Dean of Academic Affairs', name: 'Dr. Robinson P. Ponminiessary', room: 'Deans Office', nodeId: 'mt_115', floorNumber: 0 },
    ],
    servicesOffered: ['MSc & BSc Chemistry Wet Labs', 'Geochemistry & Sedimentology Analysis', 'Environmental Studies'],
    floors: buildBlockFloorsFromUserTags('MT', 'outdoor_143'),
  },

  bld_hm: {
    name: 'Hotel Management / Little Flower Block',
    code: 'HM',
    category: 'Hotel Management, Food Technology, French & Library',
    description: 'Professional hospitality training centre housing Food Technology, French language department, and dedicated commercial kitchens.',
    entranceNodeId: 'hm_465',
    totalFloors: 2,
    contactInfo: {
      phone: '0480 2825258',
      principalPhone: '0480 2820005',
      email: 'hm@christcollegeijk.edu.in',
      hours: 'Mon – Fri: 8:30 AM – 4:30 PM | Sat: 8:30 AM – 1:30 PM',
      address: 'Little Flower Block (Hotel Management), Christ College (Autonomous), Irinjalakuda - 680125',
    },
    officers: [
      { role: 'Hotel Management Coordinator', name: 'Department of Hotel Management', room: 'Hotel Mgmt Dept', nodeId: 'hm_465', floorNumber: 0 },
      { role: 'Food Technology Coordinator', name: 'Department of Food Technology', room: 'Food Tech Dept', nodeId: 'hm_472', floorNumber: 0 },
      { role: 'French Department Coordinator', name: 'Department of French', room: 'French Dept', nodeId: 'hm_472', floorNumber: 0 },
    ],
    servicesOffered: ['Food Processing & Preservation Training', 'Hospitality & Culinary Arts', 'Foreign Language Proficiency'],
    floors: buildBlockFloorsFromUserTags('HM', 'hm_465'),
  },

  bld_gabriel: {
    name: 'Fr. Gabriel Indoor Stadium (GB Block)',
    code: 'GB',
    category: 'Sports & Athletics Complex',
    description: 'Fr. Gabriel Indoor Stadium & Sports Wing featuring indoor badminton courts, table tennis academy, gymnasium, and GB landmark entrance.',
    entranceNodeId: 'bba_364',
    totalFloors: 1,
    contactInfo: {
      phone: '0480 2825258',
      principalPhone: '0480 2820005',
      email: 'sports@christcollegeijk.edu.in',
      hours: 'Mon – Sat: 6:00 AM – 7:00 PM (Sports Wing)',
      address: 'Fr. Gabriel Indoor Stadium (GB Block), Christ College (Autonomous), Irinjalakuda - 680125',
    },
    officers: [
      { role: 'Physical Education Director', name: 'Dr. Bintu T. Kalyan', room: 'Sports Wing Office', nodeId: 'bba_364', floorNumber: 0 },
    ],
    servicesOffered: ['Badminton Arena', 'Table Tennis Academy', 'Indoor Sports Championship', 'Fitness & Gym'],
    floors: buildBlockFloorsFromUserTags('GB', 'bba_364'),
  },

  bld_bpe: {
    name: 'St. Sebastian Block (BPE Block)',
    code: 'BPE',
    category: 'Physical Education Degree Programs & Sports Wing',
    description: 'St. Sebastian Block housing physical education classrooms (I B.P.E to IV B.P.E), MPES Room, Dean of Student Affairs, Table Tennis Academy, and conference facilities.',
    entranceNodeId: 'outdoor_323',
    totalFloors: 2,
    contactInfo: {
      phone: '0480 2825258',
      principalPhone: '0480 2820005',
      email: 'ped@christcollegeijk.edu.in',
      hours: 'Mon – Sat: 6:00 AM – 6:30 PM (Sports Complex & Stadium)',
      address: 'St. Sebastian Block (BPE Block), Christ College (Autonomous), Irinjalakuda - 680125',
    },
    officers: [
      { role: 'Dean of Student Affairs', name: 'Dr. Anilkumar N.', room: 'Deans Wing', nodeId: 'gb_332', floorNumber: 0 },
      { role: 'B.P.E Program In-Charge', name: 'Physical Education Faculty', room: 'MPES Room', nodeId: 'gb_352', floorNumber: 0 },
    ],
    servicesOffered: ['Bachelor of Physical Education Degree Programs', 'Table Tennis & Indoor Sports Academy', 'Academic Conferences'],
    floors: buildBlockFloorsFromUserTags('GB', 'outdoor_323'),
  },

  bld_bba: {
    name: 'BBA Block / Management Studies',
    code: 'BBA',
    category: 'Management Studies, Economics & English/History',
    description: 'Modern wing housing BBA classrooms, Department of Economics (Unaided), Department of English & History (Unaided), and Computer Lab.',
    entranceNodeId: 'bba_371',
    totalFloors: 2,
    contactInfo: {
      phone: '0480 2825258',
      principalPhone: '0480 2820005',
      email: 'bba@christcollegeijk.edu.in',
      hours: 'Mon – Fri: 8:30 AM – 4:30 PM | Sat: 8:30 AM – 1:30 PM',
      address: 'BBA Block (Management Studies), Christ College (Autonomous), Irinjalakuda - 680125',
    },
    officers: [
      { role: 'Economics Unaided Coordinator', name: 'Department of Economics', room: 'Economics Dept', nodeId: 'bba_374', floorNumber: 0 },
      { role: 'English & History Coordinator', name: 'Department of English & History', room: 'English & History Dept', nodeId: 'bba_374', floorNumber: 0 },
    ],
    servicesOffered: ['Management Case Studies & Presentations', 'Double Main Degree Studies', 'College Canteen'],
    floors: buildBlockFloorsFromUserTags('BBA', 'bba_371'),
  },

  bld_sb: {
    name: 'Sneha Bhavan Block (SB Block)',
    code: 'SB',
    category: 'Social Work, Innovation Centre & Library',
    description: 'Sneha Bhavan Block housing Department of Social Work (BSW / MSW), Christ Innovation Centre, Social Work Research Centre, Sannidhi, Library & Reading Room, and SB classrooms (SB 05–14).',
    entranceNodeId: 'sb_437',
    totalFloors: 2,
    contactInfo: {
      phone: '0480 2825258',
      principalPhone: '0480 2820005',
      email: 'msw@christcollegeijk.edu.in',
      hours: 'Mon – Fri: 8:30 AM – 4:30 PM | Sat: 8:30 AM – 1:30 PM',
      address: 'Sneha Bhavan Block (SB Block), Christ College (Autonomous), Irinjalakuda - 680125',
    },
    officers: [
      { role: 'HOD Social Work', name: 'Dr. Asha P. Rao', room: 'Department of Social Work', nodeId: 'sb_454', floorNumber: 0 },
      { role: 'Social Work Coordinator', name: 'Faculty of Social Work', room: "Coordinator's Office", nodeId: 'sb_453', floorNumber: 0 },
      { role: 'Innovation Centre In-Charge', name: 'Christ Innovation Centre', room: 'Innovation Wing', nodeId: 'sb_433', floorNumber: 0 },
    ],
    servicesOffered: ['Social Work Community Projects & Counseling', 'Innovation & Incubation Workspace', 'Library & Reading Room', 'Student Store & Canteen'],
    floors: buildBlockFloorsFromUserTags('SB', 'sb_437'),
  },

  bld_gate: {
    name: 'Main Entrance & Security Gate',
    code: 'GATE',
    category: 'Campus Access & Security Checkpoint',
    description: 'Main college entrance gate, security helpdesk, and campus directional node.',
    entranceNodeId: 'outdoor_001',
    totalFloors: 1,
    contactInfo: {
      phone: '0480 2825258',
      principalPhone: '0480 2820005',
      email: 'office@christcollegeijk.edu.in',
      hours: '24 Hours / 7 Days (Security Helpdesk)',
      address: 'Main Entrance Gate, Christ College (Autonomous), Irinjalakuda North - 680125',
    },
    floors: [
      {
        floorNumber: 0,
        name: 'Ground Level',
        nodeId: 'outdoor_001',
        description: 'Main college entrance, visitor registration & campus security.',
        departments: ['Campus Security', 'Information Helpdesk'],
        rooms: [
          { id: 'gate_main', name: 'Main Security Checkpoint', number: 'GATE-1', type: 'FACILITY', nodeId: 'outdoor_001' },
          { id: 'gate_parking', name: 'Boys Parking Area', number: 'PARK-1', type: 'FACILITY', nodeId: 'outdoor_002' },
        ],
      },
    ],
  },

  bld_aud: {
    name: 'Christ College Auditorium & Open Stage',
    code: 'AUD',
    category: 'Cultural Center & Main College Stage',
    description: 'Grand cultural auditorium for major university functions, arts festivals, and convocations.',
    entranceNodeId: 'outdoor_028',
    totalFloors: 1,
    contactInfo: {
      phone: '0480 2825258',
      principalPhone: '0480 2820005',
      email: 'office@christcollegeijk.edu.in',
      hours: 'Events & Programs Schedule',
      address: 'Main College Auditorium, Christ College (Autonomous), Irinjalakuda - 680125',
    },
    floors: [
      {
        floorNumber: 0,
        name: 'Ground Level',
        nodeId: 'outdoor_028',
        description: 'Main auditorium hall, stage, green rooms and spectator seating.',
        departments: ['Cultural Affairs', 'Student Arts Wing'],
        rooms: [
          { id: 'aud_main', name: 'Main Auditorium Hall', number: 'AUD', type: 'FACILITY', nodeId: 'outdoor_028' },
          { id: 'aud_stage', name: 'Open Air Stage', number: 'STAGE', type: 'FACILITY', nodeId: 'outdoor_021' },
        ],
      },
    ],
  },
};

// Aliases for bulletproof matching
CAMPUS_BLOCKS_INFO['ab'] = CAMPUS_BLOCKS_INFO['bld_ab'];
CAMPUS_BLOCKS_INFO['qr-ab'] = CAMPUS_BLOCKS_INFO['bld_ab'];
CAMPUS_BLOCKS_INFO['admin'] = CAMPUS_BLOCKS_INFO['bld_ab'];
CAMPUS_BLOCKS_INFO['administrative'] = CAMPUS_BLOCKS_INFO['bld_ab'];

CAMPUS_BLOCKS_INFO['mg'] = CAMPUS_BLOCKS_INFO['bld_main'];
CAMPUS_BLOCKS_INFO['bld_mg'] = CAMPUS_BLOCKS_INFO['bld_main'];
CAMPUS_BLOCKS_INFO['qr-mg'] = CAMPUS_BLOCKS_INFO['bld_main'];
CAMPUS_BLOCKS_INFO['main'] = CAMPUS_BLOCKS_INFO['bld_main'];

CAMPUS_BLOCKS_INFO['sm'] = CAMPUS_BLOCKS_INFO['bld_sm'];
CAMPUS_BLOCKS_INFO['qr-sm'] = CAMPUS_BLOCKS_INFO['bld_sm'];
CAMPUS_BLOCKS_INFO['commerce'] = CAMPUS_BLOCKS_INFO['bld_sm'];

CAMPUS_BLOCKS_INFO['sj'] = CAMPUS_BLOCKS_INFO['bld_sj'];
CAMPUS_BLOCKS_INFO['qr-sj'] = CAMPUS_BLOCKS_INFO['bld_sj'];
CAMPUS_BLOCKS_INFO['science'] = CAMPUS_BLOCKS_INFO['bld_sj'];
CAMPUS_BLOCKS_INFO['joseph'] = CAMPUS_BLOCKS_INFO['bld_sj'];

CAMPUS_BLOCKS_INFO['sc'] = CAMPUS_BLOCKS_INFO['bld_sc'];
CAMPUS_BLOCKS_INFO['qr-sc'] = CAMPUS_BLOCKS_INFO['bld_sc'];
CAMPUS_BLOCKS_INFO['chavara'] = CAMPUS_BLOCKS_INFO['bld_sc'];

CAMPUS_BLOCKS_INFO['bpe'] = CAMPUS_BLOCKS_INFO['bld_bpe'];
CAMPUS_BLOCKS_INFO['qr-bpe'] = CAMPUS_BLOCKS_INFO['bld_bpe'];
CAMPUS_BLOCKS_INFO['bped'] = CAMPUS_BLOCKS_INFO['bld_bpe'];
CAMPUS_BLOCKS_INFO['mpes'] = CAMPUS_BLOCKS_INFO['bld_bpe'];
CAMPUS_BLOCKS_INFO['sebastian'] = CAMPUS_BLOCKS_INFO['bld_bpe'];

CAMPUS_BLOCKS_INFO['bld_gb'] = CAMPUS_BLOCKS_INFO['bld_gabriel'];
CAMPUS_BLOCKS_INFO['gb'] = CAMPUS_BLOCKS_INFO['bld_gabriel'];
CAMPUS_BLOCKS_INFO['gabriel'] = CAMPUS_BLOCKS_INFO['bld_gabriel'];
CAMPUS_BLOCKS_INFO['sports'] = CAMPUS_BLOCKS_INFO['bld_gabriel'];
CAMPUS_BLOCKS_INFO['stadium'] = CAMPUS_BLOCKS_INFO['bld_gabriel'];
CAMPUS_BLOCKS_INFO['gym'] = CAMPUS_BLOCKS_INFO['bld_gabriel'];

CAMPUS_BLOCKS_INFO['hm'] = CAMPUS_BLOCKS_INFO['bld_hm'];
CAMPUS_BLOCKS_INFO['qr-hm'] = CAMPUS_BLOCKS_INFO['bld_hm'];
CAMPUS_BLOCKS_INFO['lf'] = CAMPUS_BLOCKS_INFO['bld_hm'];
CAMPUS_BLOCKS_INFO['bld_lf'] = CAMPUS_BLOCKS_INFO['bld_hm'];
CAMPUS_BLOCKS_INFO['qr-lf'] = CAMPUS_BLOCKS_INFO['bld_hm'];
CAMPUS_BLOCKS_INFO['little-flower'] = CAMPUS_BLOCKS_INFO['bld_hm'];
CAMPUS_BLOCKS_INFO['hotel'] = CAMPUS_BLOCKS_INFO['bld_hm'];

CAMPUS_BLOCKS_INFO['mt'] = CAMPUS_BLOCKS_INFO['bld_mt'];
CAMPUS_BLOCKS_INFO['qr-mt'] = CAMPUS_BLOCKS_INFO['bld_mt'];
CAMPUS_BLOCKS_INFO['teresa'] = CAMPUS_BLOCKS_INFO['bld_mt'];

CAMPUS_BLOCKS_INFO['sb'] = CAMPUS_BLOCKS_INFO['bld_sb'];
CAMPUS_BLOCKS_INFO['qr-sb'] = CAMPUS_BLOCKS_INFO['bld_sb'];
CAMPUS_BLOCKS_INFO['sneha'] = CAMPUS_BLOCKS_INFO['bld_sb'];
CAMPUS_BLOCKS_INFO['snehabhavan'] = CAMPUS_BLOCKS_INFO['bld_sb'];
CAMPUS_BLOCKS_INFO['sneha-bhavan'] = CAMPUS_BLOCKS_INFO['bld_sb'];
CAMPUS_BLOCKS_INFO['sneha-bavan'] = CAMPUS_BLOCKS_INFO['bld_sb'];
CAMPUS_BLOCKS_INFO['sneha_bhavan'] = CAMPUS_BLOCKS_INFO['bld_sb'];

CAMPUS_BLOCKS_INFO['bba'] = CAMPUS_BLOCKS_INFO['bld_bba'];
CAMPUS_BLOCKS_INFO['qr-bba'] = CAMPUS_BLOCKS_INFO['bld_bba'];
CAMPUS_BLOCKS_INFO['management'] = CAMPUS_BLOCKS_INFO['bld_bba'];

CAMPUS_BLOCKS_INFO['gate'] = CAMPUS_BLOCKS_INFO['bld_gate'];
CAMPUS_BLOCKS_INFO['gate1'] = CAMPUS_BLOCKS_INFO['bld_gate'];
CAMPUS_BLOCKS_INFO['gate-1'] = CAMPUS_BLOCKS_INFO['bld_gate'];
CAMPUS_BLOCKS_INFO['qr-gate1'] = CAMPUS_BLOCKS_INFO['bld_gate'];
CAMPUS_BLOCKS_INFO['qr-gate-1'] = CAMPUS_BLOCKS_INFO['bld_gate'];
CAMPUS_BLOCKS_INFO['main-gate'] = CAMPUS_BLOCKS_INFO['bld_gate'];

CAMPUS_BLOCKS_INFO['aud'] = CAMPUS_BLOCKS_INFO['bld_aud'];
CAMPUS_BLOCKS_INFO['qr-aud'] = CAMPUS_BLOCKS_INFO['bld_aud'];
CAMPUS_BLOCKS_INFO['auditorium'] = CAMPUS_BLOCKS_INFO['bld_aud'];

CAMPUS_BLOCKS_INFO['bld_canteen'] = {
  name: 'College Canteen',
  code: 'CANT',
  category: 'Dining & Cafeteria',
  description: 'Main campus student and faculty cafeteria serving meals, refreshments and snacks.',
  entranceNodeId: 'outdoor_155',
  totalFloors: 1,
  contactInfo: {
    phone: '0480 2825258',
    principalPhone: '0480 2820005',
    email: 'office@christcollegeijk.edu.in',
    hours: 'Mon – Sat: 7:30 AM – 5:30 PM',
    address: 'Campus Canteen, Christ College (Autonomous), Irinjalakuda - 680125',
  },
  floors: [
    {
      floorNumber: 0,
      name: 'Ground Level',
      nodeId: 'outdoor_155',
      description: 'Students and Faculty dining areas.',
      departments: ['Canteen'],
      rooms: [
        { id: 'canteen_students', name: 'Students Canteen', number: 'CANT-1', type: 'FACILITY', nodeId: 'outdoor_155' },
        { id: 'canteen_teachers', name: 'Teachers Canteen', number: 'CANT-2', type: 'FACILITY', nodeId: 'outdoor_156' },
      ],
    },
  ],
};
CAMPUS_BLOCKS_INFO['canteen'] = CAMPUS_BLOCKS_INFO['bld_canteen'];
CAMPUS_BLOCKS_INFO['cafeteria'] = CAMPUS_BLOCKS_INFO['bld_canteen'];

export const CAMPUS_BLOCKS_DATA = CAMPUS_BLOCKS_INFO;

/**
 * Returns dynamic, live block information refreshed with the latest user entered tags.
 */
export function getCampusBlockInfo(buildingId?: string | null): CampusBlockInfo {
  const cleanId = (buildingId || '').toLowerCase().trim();
  let found = CAMPUS_BLOCKS_INFO[cleanId];

  if (!found) {
    const matchedKey = Object.keys(CAMPUS_BLOCKS_INFO).find(
      (k) =>
        k === cleanId ||
        k.includes(cleanId) ||
        cleanId.includes(k) ||
        CAMPUS_BLOCKS_INFO[k].code.toLowerCase() === cleanId
    );
    found = matchedKey ? CAMPUS_BLOCKS_INFO[matchedKey] : CAMPUS_BLOCKS_INFO['bld_ab'];
  }

  // Refresh floors from live tags if available
  const liveFloors = buildBlockFloorsFromUserTags(found.code, found.entranceNodeId);
  if (liveFloors && liveFloors.length > 0) {
    return {
      ...found,
      totalFloors: liveFloors.length,
      floors: liveFloors,
    };
  }

  return found;
}
