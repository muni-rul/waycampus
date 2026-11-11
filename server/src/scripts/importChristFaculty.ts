import * as fs from 'fs';
import * as path from 'path';
import * as cheerio from 'cheerio';

const htmlPath = 'C:\\Users\\munir\\.gemini\\antigravity\\brain\\db75f71c-a259-4d8c-bb02-25c3f84396cb\\.system_generated\\steps\\1565\\content.md';
const clientFacultyAssetDir = path.resolve(__dirname, '../../../client/public/assets/faculty');

if (!fs.existsSync(clientFacultyAssetDir)) {
  fs.mkdirSync(clientFacultyAssetDir, { recursive: true });
}

export interface FacultyRecord {
  id: string;
  name?: string;
  fullName: string;
  designation: string;
  department: string;
  departmentCategory: string; // e.g. "Botany", "Chemistry", "Commerce"
  departmentType: 'AIDED' | 'UNAIDED' | 'SELF_FINANCING';
  profileImageUrl?: string;
  originalPhotoUrl?: string;
  profileLink?: string;
  vidwanLink?: string;
  sourceUrl: string;
  verified: boolean;
  lastUpdated: string;
  // Future navigation expansion fields (unmapped for now)
  buildingId?: string;
  floorId?: string;
  roomId?: string;
  roomNumber?: string;
  panoramaId?: string;
  navigationNodeId?: string;
}

const html = fs.readFileSync(htmlPath, 'utf-8');
const $ = cheerio.load(html);

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function cleanDepartmentName(raw: string): { cleanName: string; category: string } {
  let cleaned = raw
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/DEPARTMENT/gi, '')
    .trim();

  // Standardize common names
  let category = cleaned;
  if (cleaned.toLowerCase().includes('botany')) category = 'Botany';
  else if (cleaned.toLowerCase().includes('chemistry')) category = 'Chemistry';
  else if (cleaned.toLowerCase().includes('commerce')) category = 'Commerce';
  else if (cleaned.toLowerCase().includes('computer science')) category = 'Computer Science';
  else if (cleaned.toLowerCase().includes('economics')) category = 'Economics';
  else if (cleaned.toLowerCase().includes('english & history')) category = 'English & History Double Main';
  else if (cleaned.toLowerCase().includes('english')) category = 'English';
  else if (cleaned.toLowerCase().includes('environmental science') || cleaned.toLowerCase().includes('geology')) category = 'Geology & Environmental Science';
  else if (cleaned.toLowerCase().includes('food technology')) category = 'Food Technology';
  else if (cleaned.toLowerCase().includes('french')) category = 'French';
  else if (cleaned.toLowerCase().includes('german')) category = 'German';
  else if (cleaned.toLowerCase().includes('hindi')) category = 'Hindi';
  else if (cleaned.toLowerCase().includes('history')) category = 'History';
  else if (cleaned.toLowerCase().includes('hotel management')) category = 'Hotel Management & Catering Sciences';
  else if (cleaned.toLowerCase().includes('malayalam')) category = 'Malayalam';
  else if (cleaned.toLowerCase().includes('management studies') || cleaned.toLowerCase().includes('bba')) category = 'Management Studies';
  else if (cleaned.toLowerCase().includes('mathematics')) category = 'Mathematics';
  else if (cleaned.toLowerCase().includes('physical education')) category = 'Physical Education';
  else if (cleaned.toLowerCase().includes('physics')) category = 'Physics';
  else if (cleaned.toLowerCase().includes('psychology')) category = 'Psychology';
  else if (cleaned.toLowerCase().includes('sanskrit')) category = 'Sanskrit';
  else if (cleaned.toLowerCase().includes('social work') || cleaned.toLowerCase().includes('msw') || cleaned.toLowerCase().includes('bsw')) category = 'Social Work';
  else if (cleaned.toLowerCase().includes('statistics')) category = 'Statistics';
  else if (cleaned.toLowerCase().includes('vocational')) category = 'Vocational Studies';
  else if (cleaned.toLowerCase().includes('zoology')) category = 'Zoology';

  return { cleanName: cleaned, category };
}

async function run() {
  console.log('--- Starting Christ College Faculty Import ---');
  let currentSection: 'AIDED' | 'UNAIDED' | 'SELF_FINANCING' = 'AIDED';
  let currentDepartmentRaw = '';
  let currentDeptInfo = { cleanName: 'General', category: 'General' };

  const facultyRecords: FacultyRecord[] = [];
  const nameCounts = new Map<string, number>();

  // Iterate top-level sections/headers and tables
  $('h1, h2, h3, h4, table').each((_, el) => {
    const tagName = (el as any).tagName?.toLowerCase();
    const text = $(el).text().trim();

    if (tagName === 'h3' || tagName === 'h2') {
      const upper = text.toUpperCase();
      if (upper.includes('AIDED') && !upper.includes('UNAIDED') && !upper.includes('NON')) {
        currentSection = 'AIDED';
      } else if (upper.includes('UNAIDED') || upper.includes('SELF FINANCING')) {
        currentSection = 'UNAIDED';
      }
    }

    if (tagName === 'h4' || tagName === 'h3') {
      const upper = text.toUpperCase();
      if (
        (upper.includes('DEPARTMENT') || upper.includes('COMMERCE') || upper.includes('COMPUTER SCIENCE')) &&
        !upper.includes('DEPARTMENTWISE LIST')
      ) {
        currentDepartmentRaw = text;
        currentDeptInfo = cleanDepartmentName(text);
      }
    }

    if (tagName === 'table') {
      $(el).find('td').each((_, td) => {
        const tdText = $(td).text().trim();
        if (!tdText) return;

        // Extract photo
        let photoUrl = '';
        $(td).find('img').each((_, img) => {
          const src = $(img).attr('src') || '';
          if (src && !src.includes('vidwan') && !src.includes('logo') && src.includes('uploads/userfiles')) {
            photoUrl = src.trim();
          }
        });

        // Extract links
        let profileLink = '';
        let vidwanLink = '';
        $(td).find('a').each((_, a) => {
          const href = $(a).attr('href') || '';
          if (href.includes('irins.org') || href.includes('vidwan')) {
            vidwanLink = href.trim();
          } else if (href.includes('departments') || href.includes('faculty') || $(a).text().toLowerCase().includes('more')) {
            profileLink = href.trim();
          }
        });

        // Extract paragraphs
        const paragraphs: string[] = [];
        $(td).find('p').each((_, p) => {
          const pTxt = $(p).text().trim();
          if (pTxt && !pTxt.toLowerCase().includes('read more') && !pTxt.toLowerCase().includes('vidwan')) {
            paragraphs.push(pTxt);
          }
        });

        let name = '';
        let designation = '';
        if (paragraphs.length >= 2) {
          name = paragraphs[0];
          designation = paragraphs[1];
        } else if (paragraphs.length === 1) {
          const lines = paragraphs[0].split('\n').map(l => l.trim()).filter(Boolean);
          name = lines[0] || '';
          designation = lines[1] || '';
        } else {
          const lines = tdText.split('\n').map(l => l.trim()).filter(Boolean);
          name = lines[0] || '';
          designation = lines[1] || '';
        }

        // Clean up name & designation
        name = name.replace(/\s+/g, ' ').trim();
        designation = designation.replace(/\s+/g, ' ').trim();

        if (name && name.length > 2 && !name.toUpperCase().includes('DEPARTMENT') && !name.toUpperCase().includes('AIDED')) {
          const count = (nameCounts.get(name) || 0) + 1;
          nameCounts.set(name, count);

          const id = `fac_${slugify(name)}_${currentSection.toLowerCase()}${count > 1 ? `_${count}` : ''}`;

          facultyRecords.push({
            id,
            name: name,
            fullName: name,
            designation: designation || 'Faculty',
            department: `${currentDeptInfo.category} (${currentSection === 'AIDED' ? 'Aided' : 'Self-Financing'})`,
            departmentCategory: currentDeptInfo.category,
            departmentType: currentSection,
            originalPhotoUrl: photoUrl || undefined,
            profileLink: profileLink || undefined,
            vidwanLink: vidwanLink || undefined,
            sourceUrl: 'https://christcollegeijk.edu.in/facpr',
            verified: true,
            lastUpdated: '2026-08-27',
          });
        }
      });
    }
  });

  console.log(`Extracted ${facultyRecords.length} faculty records.`);

  // Download and cache photos locally
  console.log('Downloading and caching faculty profile images locally...');
  let downloadedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < facultyRecords.length; i++) {
    const record = facultyRecords[i];
    if (record.originalPhotoUrl) {
      try {
        const ext = path.extname(record.originalPhotoUrl.split('?')[0]) || '.jpg';
        const filename = `${record.id}${ext}`;
        const localPath = path.join(clientFacultyAssetDir, filename);

        // Fetch image if not already cached
        if (!fs.existsSync(localPath)) {
          const encodedUrl = encodeURI(record.originalPhotoUrl);
          const res = await fetch(encodedUrl);
          if (res.ok) {
            const buffer = Buffer.from(await res.arrayBuffer());
            fs.writeFileSync(localPath, buffer);
            record.profileImageUrl = `/assets/faculty/${filename}`;
            downloadedCount++;
          } else {
            console.warn(`[${res.status}] Failed to fetch photo for ${record.fullName}: ${record.originalPhotoUrl}`);
            failedCount++;
          }
        } else {
          record.profileImageUrl = `/assets/faculty/${filename}`;
          downloadedCount++;
        }
      } catch (err: any) {
        console.warn(`Error downloading image for ${record.fullName}:`, err.message);
        failedCount++;
      }
    }
  }

  console.log(`Image Cache Complete: ${downloadedCount} photos available, ${failedCount} missing/failed.`);

  // Write out JSON files
  const outputJsonPath = path.resolve(__dirname, '../../data/faculty.json');
  fs.writeFileSync(outputJsonPath, JSON.stringify(facultyRecords, null, 2), 'utf-8');
  console.log(`Saved faculty dataset to ${outputJsonPath}`);

  // Summary Report
  const departments = Array.from(new Set(facultyRecords.map(f => f.department)));
  const duplicates = Array.from(nameCounts.entries()).filter(([_, count]) => count > 1);

  console.log('\n================ DATA QUALITY REPORT ================');
  console.log(`Total Faculty Records Imported: ${facultyRecords.length}`);
  console.log(`Total Unique Departments: ${departments.length}`);
  console.log('Departments List:');
  departments.forEach(d => console.log(`  - ${d}`));
  console.log(`Duplicate Names Found: ${duplicates.length}`);
  duplicates.forEach(([name, count]) => console.log(`  - ${name} (Appears in ${count} places)`));
  console.log(`Records with Official Profile Photo: ${facultyRecords.filter(f => f.profileImageUrl).length}`);
  console.log(`Records without Photo: ${facultyRecords.filter(f => !f.profileImageUrl).length}`);
  console.log('=====================================================\n');
}

run().catch(console.error);
