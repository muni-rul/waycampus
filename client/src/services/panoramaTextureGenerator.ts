import { PanoramaNode } from '../../../shared/types';

/**
 * PanoramaTextureGenerator
 * Dynamically generates high-detail 2:1 equirectangular photo-sphere canvases
 * matching the authentic architecture and signage of Christ College (Autonomous), Irinjalakuda.
 */
export class PanoramaTextureGenerator {
  private static cache = new Map<string, string>();

  public static getTextureCanvas(pano: PanoramaNode): HTMLCanvasElement {
    const width = 2048;
    const height = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    const isOutdoor = pano.floorNumber === 0 && (pano.id.includes('GATE') || pano.id.includes('PALM') || pano.id.includes('CHURCH') || pano.id.includes('AUDITORIUM') || pano.id.includes('LIBRARY') || pano.id.includes('SOUTH_PORTICO'));

    if (isOutdoor) {
      this.renderOutdoorEquirectangular(ctx, width, height, pano);
    } else {
      this.renderIndoorEquirectangular(ctx, width, height, pano);
    }

    return canvas;
  }

  public static getTextureCanvasUrl(pano: PanoramaNode): string {
    if (this.cache.has(pano.id)) {
      return this.cache.get(pano.id)!;
    }

    const canvas = this.getTextureCanvas(pano);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    this.cache.set(pano.id, dataUrl);
    return dataUrl;
  }

  private static renderOutdoorEquirectangular(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    pano: PanoramaNode
  ) {
    // 1. Sky Gradient (Tropical Kerala Blue & Soft Clouds)
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.55);
    skyGrad.addColorStop(0, '#0284c7');
    skyGrad.addColorStop(0.35, '#38bdf8');
    skyGrad.addColorStop(0.7, '#bae6fd');
    skyGrad.addColorStop(1, '#e0f2fe');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h * 0.55);

    // Warm Sun Glow
    const sunGrad = ctx.createRadialGradient(w * 0.45, h * 0.25, 10, w * 0.45, h * 0.25, 200);
    sunGrad.addColorStop(0, 'rgba(255, 255, 240, 0.9)');
    sunGrad.addColorStop(0.4, 'rgba(254, 240, 138, 0.3)');
    sunGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = sunGrad;
    ctx.fillRect(0, 0, w, h * 0.55);

    // 2. Ground Terrain (Asphalt Road, Paved Interlocking Pavers & Green Lawns)
    const groundGrad = ctx.createLinearGradient(0, h * 0.5, 0, h);
    groundGrad.addColorStop(0, '#15803d');
    groundGrad.addColorStop(0.15, '#166534');
    groundGrad.addColorStop(0.4, '#334155');
    groundGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, h * 0.5, w, h * 0.5);

    // Central Paved Walkway
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.moveTo(w * 0.42, h * 0.52);
    ctx.lineTo(w * 0.58, h * 0.52);
    ctx.lineTo(w * 0.75, h);
    ctx.lineTo(w * 0.25, h);
    ctx.closePath();
    ctx.fill();

    // 3. Surrounding Heritage Buildings & Foliage Horizon
    this.renderOutdoorHorizon(ctx, w, h, pano);

    // 4. Floating Header Watermark (Christ College Street View)
    this.renderPanoHeaderBadge(ctx, w, pano);
  }

  private static renderOutdoorHorizon(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    pano: PanoramaNode
  ) {
    const horizonY = h * 0.52;

    // Distant Coconut and Palm Tree silhouettes
    ctx.fillStyle = '#065f46';
    for (let x = 0; x < w; x += 32) {
      const treeH = 40 + Math.sin(x * 0.05) * 25;
      ctx.beginPath();
      ctx.arc(x + 16, horizonY - treeH * 0.7, treeH * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Main Heritage Block South Facade (Terracotta Pitched Roof, Cream Arches)
    const facadeX = w * 0.35;
    const facadeW = w * 0.3;
    const facadeH = h * 0.32;
    const facadeY = horizonY - facadeH;

    // Main Wall
    ctx.fillStyle = '#fef3c7'; // Heritage Cream
    ctx.fillRect(facadeX, facadeY + 60, facadeW, facadeH - 60);

    // Terracotta Pitched Roof
    ctx.fillStyle = '#9a3412'; // Terracotta
    ctx.beginPath();
    ctx.moveTo(facadeX - 20, facadeY + 60);
    ctx.lineTo(facadeX + facadeW * 0.5, facadeY);
    ctx.lineTo(facadeX + facadeW + 20, facadeY + 60);
    ctx.closePath();
    ctx.fill();

    // Central Portico Pillars
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 6; i++) {
      const px = facadeX + facadeW * 0.3 + i * (facadeW * 0.08);
      ctx.fillRect(px, facadeY + 70, 14, facadeH - 70);
    }

    // Signboard: "CHRIST COLLEGE (AUTONOMOUS) IRINJALAKUDA"
    ctx.fillStyle = '#1e3a8a'; // Deep College Blue
    ctx.fillRect(facadeX + facadeW * 0.2, facadeY + 70, facadeW * 0.6, 26);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CHRIST COLLEGE (AUTONOMOUS) IRINJALAKUDA', facadeX + facadeW * 0.5, facadeY + 88);

    // Foreground Palm Trees on Boulevards
    this.renderBoulevardPalms(ctx, w, h);
  }

  private static renderBoulevardPalms(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const palmPositions = [w * 0.15, w * 0.28, w * 0.72, w * 0.85];
    for (const px of palmPositions) {
      // Trunk
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(px, h * 0.75);
      ctx.quadraticCurveTo(px + 8, h * 0.5, px, h * 0.28);
      ctx.stroke();

      // Fronds
      ctx.strokeStyle = '#15803d';
      ctx.lineWidth = 4;
      for (let a = 0; a < 8; a++) {
        const angle = (a * Math.PI) / 4;
        const fx = px + Math.cos(angle) * 70;
        const fy = h * 0.28 + Math.sin(angle) * 45;
        ctx.beginPath();
        ctx.moveTo(px, h * 0.28);
        ctx.quadraticCurveTo(px + Math.cos(angle) * 35, h * 0.25, fx, fy);
        ctx.stroke();
      }
    }
  }

  private static renderIndoorEquirectangular(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    pano: PanoramaNode
  ) {
    // 1. Indoor Ceiling (Heritage Timber Rafters & Cream Plaster)
    const ceilingGrad = ctx.createLinearGradient(0, 0, 0, h * 0.35);
    ceilingGrad.addColorStop(0, '#334155');
    ceilingGrad.addColorStop(0.6, '#f8fafc');
    ceilingGrad.addColorStop(1, '#e2e8f0');
    ctx.fillStyle = ceilingGrad;
    ctx.fillRect(0, 0, w, h * 0.35);

    // Ceiling Beams
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 6;
    for (let x = 0; x < w; x += 120) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h * 0.35);
      ctx.stroke();
    }

    // 2. Indoor Polished Marble Floor with Corridor Reflection
    const floorGrad = ctx.createLinearGradient(0, h * 0.65, 0, h);
    floorGrad.addColorStop(0, '#cbd5e1');
    floorGrad.addColorStop(0.3, '#94a3b8');
    floorGrad.addColorStop(0.7, '#64748b');
    floorGrad.addColorStop(1, '#475569');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, h * 0.65, w, h * 0.35);

    // Floor Tile Grid & Perspective Joints
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 2;
    for (let x = 0; x < w; x += 90) {
      ctx.beginPath();
      ctx.moveTo(x, h * 0.65);
      ctx.lineTo(x + (x - w * 0.5) * 0.8, h);
      ctx.stroke();
    }

    // 3. Walls, Arches, Doors & Department Signage
    const wallY = h * 0.35;
    const wallH = h * 0.3;

    // Heritage Wall Paint (Warm Cream)
    ctx.fillStyle = '#fef3c7';
    ctx.fillRect(0, wallY, w, wallH);

    // Dado Rail / Wall Baseboard (Teak Wood Trim)
    ctx.fillStyle = '#9a3412';
    ctx.fillRect(0, wallY + wallH - 18, w, 18);
    ctx.fillStyle = '#78350f';
    ctx.fillRect(0, wallY, w, 12);

    // Corridor Archways & Rooms
    this.renderCorridorFeatures(ctx, w, wallY, wallH, pano);

    // 4. Location Badge
    this.renderPanoHeaderBadge(ctx, w, pano);
  }

  private static renderCorridorFeatures(
    ctx: CanvasRenderingContext2D,
    w: number,
    wallY: number,
    wallH: number,
    pano: PanoramaNode
  ) {
    const isFirstFloorCS = pano.id.includes('CS_STAFF') || (pano.floorNumber === 1 && pano.id.includes('1F'));
    const isSecondFloor204 = pano.id.includes('204') || (pano.floorNumber === 2 && pano.id.includes('2F'));
    const isStaircase = pano.id.includes('STAIRS');
    const isElevator = pano.id.includes('LIFT');

    // Central Corridor Vanishing Point Opening (Straight View)
    const midX = w * 0.5;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(midX - 100, wallY + 20, 200, wallH - 38);

    // Arch over Corridor Opening
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(midX, wallY + 40, 100, Math.PI, 0);
    ctx.stroke();

    // Prominent Feature based on current Location
    if (isFirstFloorCS) {
      // Room 108 - Computer Science Department Door
      const doorX = w * 0.32;
      this.renderDepartmentDoor(ctx, doorX, wallY, wallH, 'ROOM 108', 'DEPT. OF COMPUTER SCIENCE', 'Prof. Divya M. S. (Coordinator)');
    } else if (isSecondFloor204) {
      // Smart Lecture Hall 204 Door
      const doorX = w * 0.68;
      this.renderDepartmentDoor(ctx, doorX, wallY, wallH, 'SMART HALL 204', 'DEPARTMENT OF COMMERCE & MANAGEMENT', 'Interactive Digital Lecture Hall');
    } else if (isStaircase) {
      // Staircase Flights with Wooden Banisters
      this.renderStaircaseGraphic(ctx, w * 0.25, wallY, wallH, pano.floorNumber);
    } else if (isElevator) {
      // Stainless Steel Elevator Doors
      this.renderElevatorDoors(ctx, w * 0.5, wallY, wallH, pano.floorNumber);
    }

    // Windows with Kerala Sunlight & Garden Trees
    this.renderHeritageWindows(ctx, w * 0.12, wallY + 25, 90, wallH - 60);
    this.renderHeritageWindows(ctx, w * 0.88, wallY + 25, 90, wallH - 60);
  }

  private static renderDepartmentDoor(
    ctx: CanvasRenderingContext2D,
    x: number,
    wallY: number,
    wallH: number,
    roomNumber: string,
    deptTitle: string,
    subtitle: string
  ) {
    const doorW = 160;
    const doorH = wallH - 30;
    const doorY = wallY + 12;

    // Polished Teakwood Door Frame
    ctx.fillStyle = '#451a03';
    ctx.fillRect(x - doorW * 0.5 - 8, doorY - 8, doorW + 16, doorH + 8);

    // Double Door Panels
    ctx.fillStyle = '#78350f';
    ctx.fillRect(x - doorW * 0.5, doorY, doorW * 0.5 - 2, doorH);
    ctx.fillRect(x + 2, doorY, doorW * 0.5 - 2, doorH);

    // Brass Handles
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(x - 8, doorY + doorH * 0.5, 4, 24);
    ctx.fillRect(x + 4, doorY + doorH * 0.5, 4, 24);

    // Department Header Plaque (Navy Blue with Gold Letters)
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(x - doorW * 0.5 - 20, doorY - 42, doorW + 40, 36);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - doorW * 0.5 - 20, doorY - 42, doorW + 40, 36);

    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(roomNumber, x, doorY - 24);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.fillText(deptTitle, x, doorY - 12);

    // Faculty Name Plaque
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.fillRect(x - doorW * 0.5 + 10, doorY + 20, doorW - 20, 28);
    ctx.fillStyle = '#0f172a';
    ctx.font = '600 10px Inter, sans-serif';
    ctx.fillText(subtitle, x, doorY + 38);
  }

  private static renderStaircaseGraphic(
    ctx: CanvasRenderingContext2D,
    x: number,
    wallY: number,
    wallH: number,
    floor: number
  ) {
    ctx.fillStyle = '#334155';
    ctx.fillRect(x - 80, wallY + 15, 160, wallH - 30);

    // Steps
    ctx.fillStyle = '#e2e8f0';
    for (let i = 0; i < 8; i++) {
      ctx.fillRect(x - 70 + i * 16, wallY + 25 + i * 14, 24, 8);
    }

    // Wooden Banister Handrail
    ctx.strokeStyle = '#9a3412';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x - 70, wallY + 18);
    ctx.lineTo(x + 60, wallY + 130);
    ctx.stroke();

    // Direction Plaque
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(x - 60, wallY - 30, 120, 24);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`STAIRCASE • FLOOR ${floor}`, x, wallY - 14);
  }

  private static renderElevatorDoors(
    ctx: CanvasRenderingContext2D,
    x: number,
    wallY: number,
    wallH: number,
    floor: number
  ) {
    const w = 150;
    const h = wallH - 24;
    const y = wallY + 10;

    // Stainless Steel Frame
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(x - w * 0.5 - 6, y - 6, w + 12, h + 6);

    // Metal Doors
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(x - w * 0.5, y, w * 0.5 - 1, h);
    ctx.fillRect(x + 1, y, w * 0.5 - 1, h);

    // Floor Indicator Screen
    ctx.fillStyle = '#000000';
    ctx.fillRect(x - 25, y - 32, 50, 24);
    ctx.fillStyle = '#22c55e';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`[${floor}] ▲`, x, y - 15);
  }

  private static renderHeritageWindows(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number
  ) {
    // Window Frame
    ctx.fillStyle = '#451a03';
    ctx.fillRect(x, y, w, h);

    // Arched Top
    ctx.beginPath();
    ctx.arc(x + w * 0.5, y, w * 0.5, Math.PI, 0);
    ctx.fill();

    // Outdoor Garden View Glass
    const glassGrad = ctx.createLinearGradient(x, y, x, y + h);
    glassGrad.addColorStop(0, '#7dd3fc');
    glassGrad.addColorStop(0.5, '#bae6fd');
    glassGrad.addColorStop(1, '#16a34a');
    ctx.fillStyle = glassGrad;
    ctx.fillRect(x + 4, y + 4, w - 8, h - 8);

    // Muntin Bars
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.5, y);
    ctx.lineTo(x + w * 0.5, y + h);
    ctx.moveTo(x, y + h * 0.5);
    ctx.lineTo(x + w, y + h * 0.5);
    ctx.stroke();
  }

  private static renderPanoHeaderBadge(
    ctx: CanvasRenderingContext2D,
    w: number,
    pano: PanoramaNode
  ) {
    const badgeW = 540;
    const badgeH = 48;
    const badgeX = w * 0.5 - badgeW * 0.5;
    const badgeY = 24;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 12);
    ctx.fill();

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Status Dot
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(badgeX + 24, badgeY + badgeH * 0.5, 6, 0, Math.PI * 2);
    ctx.fill();

    // Node Title & Quality
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(pano.name, badgeX + 42, badgeY + 22);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 11px Inter, sans-serif';
    ctx.fillText(`${pano.buildingName || 'Main Block'} • Floor ${pano.floorNumber} • Street View 360°`, badgeX + 42, badgeY + 38);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`HD 360° • ${pano.qualityScore}/100`, badgeX + badgeW - 18, badgeY + 30);
  }
}
