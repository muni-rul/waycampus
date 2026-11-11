/**
 * locationNameResolver.ts — Dynamic Campus Location & Nearest Tag Descriptor
 * Resolves any node ID to its nearest verified tag, room, or landmark.
 */
import { CAMPUS_GRAPH_MAP, getCustomPlaceTags, AREA_LABELS } from '../data/campusGraph';
import { getPlacesForNode } from '../data/campusPlaces';
import { CAMPUS_BLOCKS_INFO } from '../data/campusBlocksData';

export interface LocationDescriptor {
  title: string;
  subtitle: string;
  isNearTag: boolean;
  tagName?: string;
  blockName?: string;
  nodeId?: string;
}

/**
 * Returns a human-friendly description of the user's standing position,
 * prioritizing nearby verified tags (e.g. "Near Girls Garden", "Near AB 12").
 */
export function getNearestLocationDescriptor(nodeId?: string): LocationDescriptor {
  if (!nodeId) {
    return {
      title: 'Christ College Campus',
      subtitle: 'Main Campus Grounds',
      isNearTag: false,
    };
  }

  const cleanId = nodeId.trim();
  const node = CAMPUS_GRAPH_MAP.get(cleanId);
  const areaLabel = node?.area ? AREA_LABELS[node.area] : undefined;

  // 0. Explicit Landmark Check for Main Entrance (outdoor_001)
  if (cleanId === 'outdoor_001' || cleanId === '1') {
    return {
      title: 'Main Entrance Gate',
      subtitle: 'Main Campus Entrance Gate (Gate 1)',
      isNearTag: true,
      tagName: 'Main Entrance Gate',
      blockName: 'Main Entrance Gate',
      nodeId: cleanId,
    };
  }

  // 1. Direct Tag Check on Current Node (Highest Priority)
  const directTags = getCustomPlaceTags(cleanId);
  if (directTags && directTags.length > 0) {
    const primaryTag = directTags[0].text;
    const blockName = areaLabel || (node?.area && CAMPUS_BLOCKS_INFO[node.area.toLowerCase()]?.name) || 'Campus Grounds';
    return {
      title: `Near ${primaryTag}`,
      subtitle: blockName,
      isNearTag: true,
      tagName: primaryTag,
      blockName,
      nodeId: cleanId,
    };
  }

  // 2. Direct Registered Place Check
  const directPlaces = getPlacesForNode(cleanId);
  if (directPlaces && directPlaces.length > 0) {
    const primaryPlace = directPlaces[0];
    return {
      title: `Near ${primaryPlace.name}`,
      subtitle: primaryPlace.buildingName || 'Campus Location',
      isNearTag: true,
      tagName: primaryPlace.name,
      blockName: primaryPlace.buildingName,
      nodeId: cleanId,
    };
  }

  // 3. Proximity Check: 1-Hop Neighbor Nodes in Navigation Graph
  if (node && Array.isArray(node.connections)) {
    for (const conn of node.connections) {
      if (!conn.targetId) continue;
      const neighborTags = getCustomPlaceTags(conn.targetId);
      if (neighborTags && neighborTags.length > 0) {
        const nTag = neighborTags[0].text;
        const blockName = areaLabel || 'Campus Grounds';
        return {
          title: `Near ${nTag}`,
          subtitle: blockName,
          isNearTag: true,
          tagName: nTag,
          blockName,
          nodeId: cleanId,
        };
      }

      const neighborPlaces = getPlacesForNode(conn.targetId);
      if (neighborPlaces && neighborPlaces.length > 0) {
        const nPlace = neighborPlaces[0];
        return {
          title: `Near ${nPlace.name}`,
          subtitle: nPlace.buildingName || 'Campus Location',
          isNearTag: true,
          tagName: nPlace.name,
          blockName: nPlace.buildingName,
          nodeId: cleanId,
        };
      }
    }
  }

  // 4. Room Code / Node Identifier Parsing (e.g. "ab_012" -> "Near AB 12")
  const idMatch = cleanId.match(/^([a-z]{2,3})_(\d{2,4}[a-z]?)$/i);
  if (idMatch) {
    const prefix = idMatch[1].toUpperCase();
    const num = parseInt(idMatch[2], 10);
    const blockEntry = Object.values(CAMPUS_BLOCKS_INFO).find(
      (b) => b.code.toUpperCase() === prefix
    );
    const blockName = blockEntry?.name || `${prefix} Block`;

    // If it's an indoor room node (e.g. ab_012, mg_108, sc_014)
    if (prefix !== 'OUT' && prefix !== 'OUTDOOR') {
      const formattedRoom = `${prefix} ${num}`;
      return {
        title: `Near ${formattedRoom}`,
        subtitle: `${blockName} • Floor ${num >= 100 ? Math.floor(num / 100) : 0}`,
        isNearTag: true,
        tagName: formattedRoom,
        blockName,
        nodeId: cleanId,
      };
    }
  }

  // 5. Node Manual Number or Area Fallback
  if (node) {
    if (node.manualNumber && node.manualNumber !== cleanId) {
      return {
        title: `Near Point #${node.manualNumber}`,
        subtitle: areaLabel || 'Campus Path',
        isNearTag: true,
        nodeId: cleanId,
      };
    }
    if (areaLabel && !areaLabel.includes('Outdoor / Campus')) {
      return {
        title: `Near ${areaLabel}`,
        subtitle: 'Campus Grounds',
        isNearTag: true,
        blockName: areaLabel,
        nodeId: cleanId,
      };
    }
  }

  // 6. Default Fallback
  return {
    title: 'Near Main Entrance & Security Gate',
    subtitle: 'Christ College Campus Grounds',
    isNearTag: false,
    nodeId: cleanId,
  };
}
