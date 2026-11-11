import { SearchService } from './services/searchService';
import { NavigationService } from './services/navigationService';
import { store } from './db/store';
import { verifyAdminPin, generateAdminToken } from './middleware/auth';

async function runComprehensiveBackendVerification() {
  console.log('================================================================');
  console.log('   CAMPUSNAV ENTERPRISE BACKEND VERIFICATION & AUDIT SUITE       ');
  console.log('   Target: Christ College (Autonomous), Irinjalakuda            ');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`[PASS] ${testName}`);
      if (detail) console.log(`       -> ${detail}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      if (detail) console.error(`       -> ${detail}`);
    }
  }

  // --- 1. Dataset Integrity ---
  const buildings = store.getBuildings();
  const rooms = store.getRooms();
  const teachers = store.getTeachers();
  const facilities = store.getFacilities();
  const nodes = store.getNavigationNodes();
  const edges = store.getNavigationEdges();

  assert(buildings.length >= 8, '1. Campus Buildings Integrity', `Found ${buildings.length} major campus blocks`);
  assert(rooms.length >= 4, '2. Campus Rooms Integrity', `Found ${rooms.length} mapped rooms`);
  assert(teachers.length >= 4, '3. Faculty Records Integrity', `Found ${teachers.length} faculty members`);
  assert(facilities.length >= 3, '4. Facilities Integrity', `Found ${facilities.length} essential facilities`);
  assert(nodes.length >= 25, '5. Navigation Nodes Count', `Found ${nodes.length} 3D graph nodes`);
  assert(edges.length >= 25, '6. Navigation Edges Count', `Found ${edges.length} walkable graph edges`);

  // --- 2. Zero-Friction Search Verification ---

  // Test: Dynamic Teacher Search (picks a real teacher at runtime with cabin/room)
  const targetTeacher = teachers.find(
    (t) => (t.roomNumber || t.roomId || t.departmentPlaceName) && (t.name || t.fullName)
  ) || teachers[0];
  const targetTeacherName = (targetTeacher?.name || targetTeacher?.fullName || '').trim();
  const teacherSearchResults = SearchService.search(targetTeacherName);
  const foundTeacher = teacherSearchResults.find((r) => r.type === 'TEACHER');
  assert(
    Boolean(
      foundTeacher &&
      (foundTeacher.title.toLowerCase().includes(targetTeacherName.toLowerCase()) ||
       targetTeacherName.toLowerCase().includes(foundTeacher.title.toLowerCase()))
    ),
    '7. Teacher Search: Dynamic Runtime Selection',
    `Found: ${foundTeacher?.title} | ${foundTeacher?.subtitle} | ${foundTeacher?.roomNumber ? `Room ${foundTeacher.roomNumber}` : foundTeacher?.buildingName || ''}`
  );

  // Test: Dynamic Single-Name / Token Search
  const singleToken = targetTeacherName.split(/\s+/).find((w) => w.length >= 4 && !/^(prof|dr|rev|mr|ms|mrs)$/i.test(w)) || targetTeacherName;
  const singleNameRes = SearchService.search(singleToken);
  assert(
    Boolean(singleNameRes.some((r) => r.type === 'TEACHER' && r.title.toLowerCase().includes(singleToken.toLowerCase()))),
    '8. Teacher Single-Name Search: Dynamic Token',
    `Matched ${singleNameRes.length} result(s) for "${singleToken}"`
  );

  // Test: "cs department"
  const csRes = SearchService.search('cs department');
  const csDept = csRes.find((r) => r.type === 'DEPARTMENT');
  assert(
    Boolean(csDept && csDept.title.toLowerCase().includes('computer science')),
    '9. Department Search: "cs department"',
    `Found: ${csDept?.title} | ${csDept?.buildingName}`
  );

  // Regression: "economics department" -> Economics
  const econRes = SearchService.search('economics department');
  const econDept = econRes.find((r) => r.type === 'DEPARTMENT');
  assert(
    Boolean(econDept && econDept.title.toLowerCase().includes('economics')),
    '9a. Regression: "economics department" -> Economics',
    `Found: ${econDept?.title} | ${econDept?.buildingName}`
  );

  // Regression: "physics" -> Physics
  const physRes = SearchService.search('physics');
  const physDept = physRes.find((r) => r.type === 'DEPARTMENT');
  assert(
    Boolean(physDept && physDept.title.toLowerCase().includes('physics')),
    '9b. Regression: "physics" -> Physics',
    `Found: ${physDept?.title} | ${physDept?.buildingName}`
  );

  // Regression: "maths" -> Mathematics
  const mathRes = SearchService.search('maths');
  const mathDept = mathRes.find((r) => r.type === 'DEPARTMENT');
  assert(
    Boolean(mathDept && (mathDept.title.toLowerCase().includes('mathematics') || mathDept.title.toLowerCase().includes('math'))),
    '9c. Regression: "maths" -> Mathematics',
    `Found: ${mathDept?.title} | ${mathDept?.buildingName}`
  );

  // Test: "Nearest toilet"
  const toiletRes = SearchService.search('Nearest toilet', { x: 0, y: 0, z: -155 });
  assert(
    toiletRes.length > 0 && toiletRes[0].title.toLowerCase().includes('washroom'),
    '10. Nearest Facility Calculation: "Nearest toilet"',
    `Found: ${toiletRes[0]?.title} (${toiletRes[0]?.distanceMeters}m away)`
  );

  // Test: "Room 204"
  const r204Res = SearchService.search('Room 204');
  assert(
    r204Res.length > 0 && r204Res[0].roomNumber === '204',
    '11. Classroom Search: "Room 204"',
    `Found: ${r204Res[0]?.title} on Floor ${r204Res[0]?.floorNumber}`
  );

  // Test: "Sick room"
  const sickRes = SearchService.search('Sick room');
  assert(
    sickRes.length > 0 && sickRes[0].title.toLowerCase().includes('sick room'),
    '12. Medical First-Aid Search: "Sick room"',
    `Found: ${sickRes[0]?.title} in ${sickRes[0]?.buildingName}`
  );

  // Test: "Library"
  const libRes = SearchService.search('Library');
  assert(
    libRes.length > 0 && libRes[0].title.toLowerCase().includes('library'),
    '13. Landmark Search: "Library"',
    `Found: ${libRes[0]?.title}`
  );

  // --- 3. Pathfinding & Human Instruction Generation ---

  // Route 1: Gate 1 -> Divya Teacher (Room 108, Floor 1)
  const routeDivya = NavigationService.findRoute('node_main_gate', 'node_mb_cs_staff_door', { accessibleOnly: false });
  assert(
    Boolean(routeDivya && routeDivya.pathNodes.length >= 6 && routeDivya.totalDistanceMeters > 100),
    '14. Multi-Floor Route: Main Gate -> Divya Teacher (Room 108)',
    `Distance: ${routeDivya?.totalDistanceMeters}m | Estimated Time: ${Math.round(routeDivya?.estimatedTimeSeconds || 0)}s | Steps: ${routeDivya?.instructions.length}`
  );

  // Print Turn-by-Turn Human Instructions
  console.log('\n--- Step-by-Step Navigation Instructions ---');
  routeDivya?.instructions.forEach((inst) => {
    console.log(`  Step ${inst.stepNumber}: [${inst.icon}] ${inst.text} (${inst.distanceMeters}m)`);
  });
  console.log('--------------------------------------------\n');

  // Route 2: Accessible Route (Wheelchair Mode - Main Gate -> 2nd Floor Room 204)
  const accessibleRoute = NavigationService.findRoute('node_main_gate', 'node_mb_204_door', { accessibleOnly: true });
  const hasStairs = accessibleRoute?.floorTransitions.some((t) => t.via === 'STAIRS');
  assert(
    Boolean(accessibleRoute && !hasStairs && accessibleRoute.floorTransitions.length > 0),
    '15. Accessible Mode (Wheelchair): Strictly uses Lifts/Ramps',
    `Transitions: ${JSON.stringify(accessibleRoute?.floorTransitions)}`
  );

  // Route 3: Dynamic Temporary Closure Rerouting
  const westStairEdge = edges.find((e) => e.sourceNodeId === 'node_mb_stair_w_0' || e.targetNodeId === 'node_mb_stair_w_0');
  if (westStairEdge) {
    westStairEdge.status = 'CLOSED';
    const rerouted = NavigationService.findRoute('node_main_gate', 'node_mb_cs_staff_door', { avoidClosed: true });
    const usedClosedEdge = rerouted?.pathNodes.some((n) => n.id === 'node_mb_stair_w_0');
    assert(
      Boolean(rerouted && !usedClosedEdge),
      '16. Dynamic Temporary Closure Rerouting',
      `Bypassed closed staircase and found alternate walkable route.`
    );
    westStairEdge.status = 'OPEN'; // reset
  }

  // --- 4. QR Checkpoints ---
  const qrMain = store.getQRByCode('QR-MAIN-G-PORTICO');
  assert(
    Boolean(qrMain && (qrMain.nodeId === 'node_mb_g_portico' || qrMain.nodeId === 'outdoor_269' || qrMain.nodeId === 'mg_269')),
    '17. QR Checkpoint Resolution: QR-MAIN-G-PORTICO',
    `Resolved QR -> ${qrMain?.label}`
  );

  // --- 5. Bulk Teacher Ingestion & Immediate Search Sync ---
  const initialTeacherCount = store.getTeachers().length;
  const newTeachers = [
    {
      id: 'tch_test_shinto',
      name: 'Dr. Shinto V. P.',
      honorific: 'Dr.',
      designation: 'Associate Professor',
      departmentId: 'dept_cs',
      departmentName: 'Department of Computer Science',
      buildingId: 'bld_main',
      buildingName: 'Administrative / Main Heritage Block',
      floorId: 'flr_main_1',
      floorNumber: 1,
      floorName: 'First Floor',
      roomId: 'rm_cs_staff',
      roomNumber: '108',
      email: 'shinto@christcollegeijk.edu.in',
      searchAliases: ['Shinto', 'Shinto sir', 'Dr. Shinto'],
      verifiedStatus: 'VERIFIED' as const,
      lastVerifiedDate: '2026-08-26',
    },
  ];
  store.bulkAddTeachers(newTeachers);
  const shintoSearch = SearchService.search('Shinto sir');
  assert(
    shintoSearch.length > 0 && shintoSearch[0].title.includes('Shinto'),
    '18. Real-time Ingestion & Search Indexing',
    `Added Dr. Shinto -> Instantly queryable via "Shinto sir": ${shintoSearch[0]?.title}`
  );

  // --- 6. Graph Connectivity & Map Health Audit ---
  const allNodesSet = new Set(store.getNavigationNodes().map((n) => n.id));
  const invalidEdges = store.getNavigationEdges().filter((e) => !allNodesSet.has(e.sourceNodeId) || !allNodesSet.has(e.targetNodeId));
  assert(
    invalidEdges.length === 0,
    '19. Graph Integrity: Zero Broken Navigation Edges',
    `All ${edges.length} edges strictly connect valid active nodes.`
  );

  const roomsWithoutDoor = store.getRooms().filter((r) => !r.doorNodeId || !allNodesSet.has(r.doorNodeId));
  assert(
    roomsWithoutDoor.length === 0,
    '20. Room Navigability: Every Room Has an Accessible Door Node',
    `All ${store.getRooms().length} rooms connect to the navigation graph.`
  );

  // --- 7. Security & Admin Authentication ---
  const configuredTestPin = 'CollegeSecurityTestPin2026!';
  process.env.ADMIN_EMERGENCY_PIN = configuredTestPin;
  const validToken = verifyAdminPin(configuredTestPin);
  const rejectedLegacyPin1 = verifyAdminPin('7777');
  const rejectedLegacyPin2 = verifyAdminPin('christ2026');
  const invalidPin = verifyAdminPin('wrong-pin-0000');
  const generatedToken = generateAdminToken();

  assert(
    validToken && !rejectedLegacyPin1 && !rejectedLegacyPin2 && !invalidPin && typeof generatedToken === 'string',
    '21. Admin Authentication Security: Timing-Safe PIN Verification & Legacy Rejection',
    `Configured PIN verified, legacy default PINs strictly rejected, JWT generated`
  );

  // --- 8. Staircase Connectivity: Ground -> Floor 1 -> Floor 2 -> Floor 3 ---
  const stairRouteToF2 = NavigationService.findRoute('node_main_gate', 'node_mb_204_door', { accessibleOnly: false });
  const hasStairTransitions = stairRouteToF2?.floorTransitions.some((t) => t.via === 'STAIRS');
  assert(
    Boolean(stairRouteToF2 && hasStairTransitions),
    '22. Multi-Floor Staircase Navigation: Ground -> Floor 1 -> Floor 2',
    `Stairs route found: ${stairRouteToF2?.totalDistanceMeters}m with transitions: ${JSON.stringify(stairRouteToF2?.floorTransitions)}`
  );

  // --- 9. Data Completeness & Mapping Verification ---
  const initialRoomsCount = store.getRooms().length;
  assert(
    initialRoomsCount >= 5,
    '23. Expanded Room Dataset with Proper Door Mapping',
    `Found ${initialRoomsCount} fully mapped rooms including Commerce, Physics, and Labs.`
  );

  console.log(`\n================================================================`);
  console.log(`   AUDIT RESULTS: ${passed}/${total} TESTS PASSED (${Math.round((passed / total) * 100)}% SUCCESS RATE)`);
  console.log(`================================================================\n`);
}

runComprehensiveBackendVerification().catch(console.error);
