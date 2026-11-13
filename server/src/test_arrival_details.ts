import assert from 'assert';
import { formatFloorLabel, resolveArrivalDetails } from '../../shared/arrivalDetails';

console.log('=== RUNNING ARRIVAL LOGIC TESTS ===');

// 1. Floor label formatting
{
  assert.strictEqual(formatFloorLabel(0), 'Ground Floor');
  assert.strictEqual(formatFloorLabel(1), '1st Floor');
  assert.strictEqual(formatFloorLabel(2), '2nd Floor');
  assert.strictEqual(formatFloorLabel(3), '3rd Floor');
  assert.strictEqual(formatFloorLabel(4), 'Floor 4');
  assert.strictEqual(formatFloorLabel(null), 'Ground Floor');
  assert.strictEqual(formatFloorLabel(undefined), 'Ground Floor');
  assert.strictEqual(formatFloorLabel('1'), '1st Floor');
}

// 2. Resolve destination arrival details for standard place
{
  const details = resolveArrivalDetails({
    isArrived: true,
    destinationTitle: 'Smart Lecture Hall 204',
    selectedDestination: {
      title: 'Smart Lecture Hall 204',
      buildingName: 'Mother Teresa Block',
      floorNumber: 2,
      type: 'ROOM',
    },
    currentPanorama: {
      name: 'Corridor 2nd Floor',
      buildingName: 'MT Block',
      floorNumber: 2,
    },
  });

  assert.strictEqual(details.isArrived, true);
  assert.strictEqual(details.placeName, 'Smart Lecture Hall 204');
  assert.strictEqual(details.buildingName, 'Mother Teresa Block');
  assert.strictEqual(details.floorLabel, '2nd Floor');
  assert.strictEqual(details.isTeacher, false);
  assert.strictEqual(details.teacherId, undefined);
}

// 3. Resolve destination arrival details for Teacher
{
  const details = resolveArrivalDetails({
    isArrived: true,
    destinationTitle: 'Dr. Jolly Andrews CMI',
    selectedDestination: {
      title: 'Dr. Jolly Andrews CMI',
      buildingName: 'Administrative Block',
      floorNumber: 0,
      type: 'FACULTY',
      facultyId: 'fac_jolly_andrews',
    },
  });

  assert.strictEqual(details.isArrived, true);
  assert.strictEqual(details.placeName, 'Dr. Jolly Andrews CMI');
  assert.strictEqual(details.buildingName, 'Administrative Block');
  assert.strictEqual(details.floorLabel, 'Ground Floor');
  assert.strictEqual(details.isTeacher, true);
  assert.strictEqual(details.teacherId, 'fac_jolly_andrews');
}

// 4. Non-arrived state propagation
{
  const details = resolveArrivalDetails({
    isArrived: false,
    destinationTitle: 'Library',
  });
  assert.strictEqual(details.isArrived, false);
  assert.strictEqual(details.placeName, 'Library');
}

console.log('✓ ALL ARRIVAL LOGIC TESTS PASSED');
