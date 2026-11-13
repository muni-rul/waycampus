# CampNav Cloud Firestore Data Model Specification

## 1. Overview & Architecture

CampNav uses Google Cloud Firestore as the single authoritative source of truth for all runtime data across all environments (local development, staging, and production on Render).

### Core Principles
1. **Server-Side Admin SDK Mediated**: All reads and writes to Firestore are executed by the Express backend API using `firebase-admin`. Security rules strictly forbid all direct client SDK access (`allow read, write: if false;`).
2. **In-Memory Caching for Zero-Cost Visitor Reads**: The Express backend loads data from Firestore into an in-memory cache at boot and subscribes to realtime updates via `onSnapshot`. All public read operations (campus map, navigation paths, faculty directory, faculty presence statuses) are served 100% from RAM, consuming 0 Firestore read operations per visitor.
3. **500 KiB Document Size Safety Ceiling**: Although Firestore allows up to 1 MiB per document, CampNav sets an internal hard limit of 500 KiB per document. Entities with open-ended or unbounded growth (audit logs, accounts, statuses, overrides) are divided into per-entity documents.
4. **Spark Plan Free Quota Discipline**: Free tier allows 50,000 reads/day, 20,000 writes/day, 20,000 deletes/day, and 1 GiB total storage. With ~350 documents total, a server cold boot consumes ~350 reads (< 1% of daily allowance). Realtime delta listeners stream only mutated documents.

---

## 2. Store State Inventory & Collection Design

| Key / Domain | In-Memory Type | Estimated Record Count | Growth Pattern | Firestore Collection / Document Path | Doc Size Range |
|---|---|---|---|---|---|
| **Campus Organization** | `Organization[]` | 1 | Static | `campus_structure/organizations` | ~1 KB |
| **Campuses** | `Campus[]` | 1 | Static | `campus_structure/campuses` | ~2 KB |
| **Buildings** | `Building[]` | 12 | Slow / Fixed | `campus_structure/buildings` or `buildings/{id}` | ~8 KB total |
| **Floors** | `Floor[]` | 28 | Slow / Fixed | `campus_structure/floors` | ~10 KB total |
| **Rooms** | `Room[]` | 5 | Slow | `campus_structure/rooms` | ~2 KB |
| **Departments** | `Department[]` | 15 | Static | `campus_structure/departments` | ~5 KB |
| **Academic Departments** | `AcademicDepartment[]` | 24 | Static | `academic_catalog/departments` | ~8 KB |
| **Programmes** | `Programme[]` | 40 | Slow | `academic_catalog/programmes` | ~15 KB |
| **Classrooms** | `ClassroomRecord[]` | 69 | Slow | `academic_catalog/classrooms` | ~25 KB |
| **Laboratories** | `LaboratoryRecord[]` | 33 | Slow | `academic_catalog/laboratories` | ~12 KB |
| **Facilities** | `Facility[]` | 4 | Slow | `campus_structure/facilities` | ~3 KB |
| **QR Checkpoints** | `QRCheckpoint[]` | 20 | Slow | `campus_structure/qr_checkpoints` | ~4 KB |
| **Search Aliases** | `SearchAlias[]` | 80 | Periodic admin edits | `settings/search_aliases` | ~10 KB |
| **Teachers / Faculty Directory**| `Teacher[]` | ~278 | Slow (annual hires) | `teachers/{facultyId}` | ~500 B - 1 KB per doc |
| **Faculty Accounts** | `FacultyAccount[]` | ~278 | Bounded by faculty count | `facultyAccounts/{facultyId}` | ~400 B per doc |
| **Faculty Email Lookups** | `{ facultyId }` | ~278 | 1:1 with faculty accounts | `facultyEmailLookups/{emailSha}` | ~100 B per doc |
| **Faculty Presence Statuses** | `Record<string, FacultyStatusRecord>` | ~278 | Frequent teacher updates | `facultyStatuses/{facultyId}` | ~350 B per doc |
| **Faculty Status Audit Logs** | `FacultyStatusAuditLog[]` | Unbounded | Append-only per status change | `facultyStatusAuditLogs/{logId}` | ~300 B per doc |
| **Admin Users** | `AdminUser[]` | 1 - 3 | Static | `adminUsers/{username}` | ~400 B per doc |
| **Admin Audit Logs** | `AdminAuditAction[]` | Unbounded | Append-only per admin action | `adminAuditLogs/{logId}` | ~350 B per doc |
| **Navigation Nodes** | `NavigationNode[]` | ~150 | Admin graph edits | `nav_nodes/{nodeId}` | ~300 B per doc |
| **Navigation Edges** | `NavigationEdge[]` | ~250 | Admin graph edits | `nav_edges/{edgeId}` | ~250 B per doc |
| **Panoramas** | `PanoramaNode[]` | ~120 | Admin panorama updates | `panoramas/{panoId}` | ~1 - 2 KB per doc |
| **Graph Overrides: Connections**| `Record<string, any[]>` | Dynamic | Admin custom connections | `graph_overrides/customConnections` | ~15 - 50 KB |
| **Graph Overrides: Place Tags** | `Record<string, CustomPlaceTag[]>` | Dynamic | Admin custom tags | `graph_overrides/customPlaceTags` | ~20 - 60 KB |
| **Graph Overrides: Manual Numbers**| `Record<string, string>` | Dynamic | Admin manual numbers | `graph_overrides/manualNumbers` | ~5 - 15 KB |
| **Graph Overrides: Node Headings**| `Record<string, number>` | Dynamic | Admin node headings | `graph_overrides/nodeHeadingOverrides` | ~5 - 10 KB |
| **Graph Overrides: Verified Status**| `Record<string, string>`| Dynamic | Admin verified status | `graph_overrides/verifiedStatusOverrides` | ~5 - 10 KB |
| **Graph Overrides: Custom Panoramas**| `Record<string, CustomPanoramaDefinition>` | Dynamic | Admin custom panoramas | `graph_overrides/customPanoramas` | ~20 - 80 KB |
| **Graph Overrides: Metadata** | `publishStatus`, `lastSavedAt` | 1 | Updated on admin edit | `graph_overrides/metadata` | ~1 KB |
| **Campus Reports** | `CampusReport[]` | Unbounded | User report submissions | `campusReports/{reportId}` | ~500 B per doc |
| **Analytics** | `AnalyticsQuery[]` | Unbounded | Search queries log | `analyticsQueries/{queryId}` | ~200 B per doc |

---

## 3. Document Schemas & Indexing

### 3.1 `facultyAccounts/{facultyId}`
Stores authentication credentials for each faculty member. Passwords are encrypted with bcrypt (cost factor 10 or 12).
```typescript
interface FacultyAccountDoc {
  id: string;               // e.g., "FAC-CS-042"
  officialEmail: string;    // e.g., "teacher@christcollegeijk.edu.in" (normalized lowercase)
  passwordHash: string;     // bcrypt hash (never plaintext)
  mustChangePassword: boolean; // true until first login
  createdAt: string;        // ISO 8601
  updatedAt: string;        // ISO 8601
  lastLoginAt?: string;     // ISO 8601
}
```
**Index**: Direct lookup by document ID `facultyId`.

### 3.2 `facultyEmailLookups/{normalizedEmailHex}`
Enforces email uniqueness in Firestore transactions without table-wide collection scans.
- Document ID: SHA-256 hash or escaped string of normalized lowercase email.
```typescript
interface FacultyEmailLookupDoc {
  email: string;
  facultyId: string;
  createdAt: string;
}
```

### 3.3 `facultyStatuses/{facultyId}`
Stores the current presence status of a faculty member.
```typescript
interface FacultyStatusDoc {
  teacherId: string;
  status: 'AVAILABLE' | 'BUSY' | 'IN_CLASS' | 'ON_LEAVE' | 'OUT_OF_OFFICE';
  message?: string;
  until?: string;          // ISO 8601
  location?: string;
  updatedAt: string;       // ISO 8601
  updatedBy: string;       // teacher ID or admin
  source: 'FACULTY_PORTAL' | 'ADMIN';
}
```

### 3.4 `facultyStatusAuditLogs/{logId}`
Append-only log of every status change.
```typescript
interface FacultyStatusAuditLogDoc {
  id: string;
  teacherId: string;
  teacherName?: string;
  previousStatus?: string;
  newStatus: string;
  message?: string;
  until?: string;
  changedBy: string;
  source: string;
  timestamp: string;      // ISO 8601
}
```
**Index**: Single field index on `teacherId` (ASC) and `timestamp` (DESC).

### 3.5 `adminAuditLogs/{logId}`
Append-only log of administrator mutations.
```typescript
interface AdminAuditLogDoc {
  id: string;
  action: string;
  performedBy: string;
  targetId?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  timestamp: string;      // ISO 8601
}
```

---

## 4. Quota Consumption & Spark Plan Fit

For a campus of ~300 faculty members and ~5,000 daily visitors:

| Operation | Daily Volume | Free Spark Quota | Usage % |
|---|---|---|---|
| **Public Visitor Reads** | 0 reads (Served 100% from RAM cache) | 50,000 reads/day | **0.0%** |
| **Server Boot Cold-Load**| ~350 document reads | 50,000 reads/day | **0.7%** |
| **Realtime Delta Sync** | ~200 - 600 doc changes/day | 50,000 reads/day | **0.4% - 1.2%** |
| **Faculty Status Updates** | ~300 - 600 writes/day (status + log) | 20,000 writes/day | **1.5% - 3.0%** |
| **Admin Mutations** | ~10 - 50 writes/day | 20,000 writes/day | **< 0.3%** |
| **Total Storage** | ~15 - 25 MB total database data | 1,024 MB (1 GiB) | **1.5% - 2.5%** |

Conclusion: CampNav easily stays under **3% of free Spark quotas** indefinitely.
