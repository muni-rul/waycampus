export interface ArrivalCardDetails {
  isArrived: boolean;
  placeName: string;
  buildingName: string;
  floorLabel: string;
  isTeacher: boolean;
  teacherId?: string;
}

export function formatFloorLabel(floorNumber?: number | string | null): string {
  if (floorNumber === undefined || floorNumber === null) return 'Ground Floor';
  const f = typeof floorNumber === 'string' ? parseInt(floorNumber, 10) : floorNumber;
  if (isNaN(f) || f === 0) return 'Ground Floor';
  if (f === 1) return '1st Floor';
  if (f === 2) return '2nd Floor';
  if (f === 3) return '3rd Floor';
  return `Floor ${f}`;
}

export function resolveArrivalDetails(params: {
  isArrived: boolean;
  destinationTitle?: string | null;
  selectedDestination?: any;
  currentPanorama?: any;
}): ArrivalCardDetails {
  const { isArrived, destinationTitle, selectedDestination, currentPanorama } = params;

  const placeName =
    destinationTitle ||
    selectedDestination?.title ||
    selectedDestination?.name ||
    currentPanorama?.name ||
    'Destination';

  const buildingName =
    selectedDestination?.buildingName ||
    selectedDestination?.building ||
    currentPanorama?.buildingName ||
    'Campus Building';

  const floorNumber =
    selectedDestination?.floor ??
    selectedDestination?.floorNumber ??
    currentPanorama?.floorNumber ??
    0;

  const floorLabel = formatFloorLabel(floorNumber);

  const isTeacher = Boolean(
    selectedDestination &&
    (selectedDestination.type === 'FACULTY' ||
      selectedDestination.type === 'TEACHER' ||
      selectedDestination.category === 'FACULTY' ||
      selectedDestination.facultyId)
  );

  const teacherId =
    selectedDestination?.facultyId ||
    (isTeacher ? selectedDestination?.id : undefined);

  return {
    isArrived,
    placeName,
    buildingName,
    floorLabel,
    isTeacher,
    teacherId,
  };
}
