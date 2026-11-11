import { SearchService } from './services/searchService';
import { NavigationService } from './services/navigationService';
import { store } from './db/store';

async function runVerification() {
  console.log('====================================================');
  console.log('   CAMPUSNAV PRODUCTION ENGINE VERIFICATION SUITE   ');
  console.log('   Deployment: Christ College (Autonomous), Irinjalakuda');
  console.log('====================================================\n');

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

  assert(buildings.length >= 8, '1. Campus Buildings Seed Count', `Found ${buildings.length} major campus blocks`);
  assert(rooms.length >= 4, '2. Main Block & Campus Rooms Count', `Found ${rooms.length} structured rooms`);
  assert(teachers.length >= 4, '3. Faculty Records Count', `Found ${teachers.length} faculty entries`);
  assert(nodes.length >= 25, '4. 3D Navigation Nodes Count', `Found ${nodes.length} connected 3D nodes`);
  assert(edges.length >= 25, '5. Walkable Edges Count', `Found ${edges.length} navigation edges`);

  // --- 2. MVP User Scenarios ---

  // Scenario 1: Search "Computer Science"
  const csResults = SearchService.search('Computer Science');
  const csDept = csResults.find((r) => r.type === 'DEPARTMENT');
  assert(
    Boolean(csDept && (csDept.buildingName?.includes('South') || csDept.buildingName?.includes('Main'))),
    '6. MVP Scenario 1: Search "Computer Science"',
    `Matched: ${csDept?.title} | ${csDept?.buildingName} (Floor ${csDept?.floorNumber})`
  );

  // Scenario 2: Search verified faculty "Soumya"
  const facultyResults = SearchService.search('Soumya');
  const facultyMember = facultyResults.find((r) => r.type === 'TEACHER');
  assert(
    Boolean(facultyMember && facultyMember.title.includes('Soumya')),
    '7. MVP Scenario 2: Search verified faculty "Soumya"',
    `Matched: ${facultyMember?.title} | ${facultyMember?.subtitle}`
  );

  // Scenario 3: Search "Bathroom" / "Nearest toilet"
  const toiletResults = SearchService.search('Nearest toilet', { x: 0, y: 0, z: -155 });
  assert(
    toiletResults.length > 0 && toiletResults[0].title.toLowerCase().includes('washroom'),
    '8. MVP Scenario 3: Nearest Washroom Calculation',
    `Matched: ${toiletResults[0]?.title} (${toiletResults[0]?.distanceMeters}m away)`
  );

  // Scenario 4: Search "Room 204"
  const r204Results = SearchService.search('Room 204');
  assert(
    r204Results.length > 0 && r204Results[0].roomNumber === '204',
    '9. Search Room "204"',
    `Matched: ${r204Results[0]?.title} | Floor ${r204Results[0]?.floorNumber}`
  );

  // Scenario 5: Search "Sick Room"
  const sickResults = SearchService.search('Sick Room');
  assert(
    sickResults.length > 0 && sickResults[0].title.toLowerCase().includes('sick room'),
    '10. Search "Sick Room"',
    `Matched: ${sickResults[0]?.title} in ${sickResults[0]?.buildingName}`
  );

  // --- 3. Deterministic 3D Navigation Pathfinding ---

  // Route 1: Main Gate -> Divya Teacher (Room 108, 1st Floor)
  const routeDivya = NavigationService.findRoute('node_main_gate', 'node_mb_cs_staff_door', { accessibleOnly: false });
  assert(
    Boolean(routeDivya && routeDivya.pathNodes.length >= 6 && routeDivya.totalDistanceMeters > 100),
    '11. Multi-Floor Route: Main Gate -> Divya Teacher (Room 108)',
    `Total Distance: ${routeDivya?.totalDistanceMeters}m | Estimated Time: ${Math.round(routeDivya?.estimatedTimeSeconds || 0)}s | Steps: ${routeDivya?.instructions.length}`
  );

  // Check turn-by-turn instruction quality
  console.log('\n--- Step-by-Step Instructions to Divya Teacher ---');
  routeDivya?.instructions.forEach((inst) => {
    console.log(`  Step ${inst.stepNumber}: [${inst.icon}] ${inst.text} (${inst.distanceMeters}m)`);
  });
  console.log('--------------------------------------------------\n');

  // Route 2: Accessible Mode Route (Main Gate -> 2nd Floor Room 204)
  const accessibleRoute = NavigationService.findRoute('node_main_gate', 'node_mb_204_door', { accessibleOnly: true });
  const hasStairs = accessibleRoute?.floorTransitions.some((t) => t.via === 'STAIRS');
  assert(
    Boolean(accessibleRoute && !hasStairs),
    '12. Accessible Routing (Wheelchair Mode)',
    `Route strictly uses lifts/ramps. Transitions: ${JSON.stringify(accessibleRoute?.floorTransitions)}`
  );

  // Route 3: Dynamic Temporary Closure Rerouting
  const westStairEdge = edges.find((e) => e.sourceNodeId === 'node_mb_stair_w_0' || e.targetNodeId === 'node_mb_stair_w_0');
  if (westStairEdge) {
    westStairEdge.status = 'CLOSED';
    const rerouted = NavigationService.findRoute('node_main_gate', 'node_mb_cs_staff_door', { avoidClosed: true });
    const usedClosedEdge = rerouted?.pathNodes.some((n) => n.id === 'node_mb_stair_w_0');
    assert(
      Boolean(rerouted && !usedClosedEdge),
      '13. Dynamic Temporary Closure Rerouting',
      `Successfully bypassed closed staircase. Route found via alternate path.`
    );
    westStairEdge.status = 'OPEN'; // reset
  }

  // --- 4. QR Checkpoints ---
  const qrMain = store.getQRByCode('QR-MAIN-G-PORTICO');
  assert(
    Boolean(qrMain && (qrMain.nodeId === 'outdoor_269' || qrMain.nodeId === 'node_mb_g_portico')),
    '14. QR Checkpoint Resolution',
    `Resolved QR-MAIN-G-PORTICO -> ${qrMain?.label}`
  );

  // --- 5. Data Verification Workflow ---
  const verifiedSuccess = store.updateVerificationStatus('ROOM', 'rm_principal', 'VERIFIED', 'Campus Verification Officer');
  const updatedRoom = store.getRoomById('rm_principal');
  assert(
    Boolean(verifiedSuccess && updatedRoom?.verifiedStatus === 'VERIFIED' && updatedRoom?.verifiedBy),
    '15. Verification Workflow Stamp',
    `Verified By: ${updatedRoom?.verifiedBy} on ${updatedRoom?.lastVerifiedDate}`
  );

  console.log(`\nRESULTS: ${passed}/${total} TESTS PASSED (${Math.round((passed / total) * 100)}% SUCCESS RATE)\n`);
}

runVerification().catch(console.error);
