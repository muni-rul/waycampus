import React, { useState } from 'react';
import {
  HelpCircle,
  MessageSquare,
  MapPin,
  Users,
  KeyRound,
  FileSpreadsheet,
  Link2,
  Camera,
  Download,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Search,
} from 'lucide-react';

interface GuideItem {
  id: string;
  title: string;
  icon: React.ElementType;
  color: string;
  steps: string[];
}

const GUIDES: GuideItem[] = [
  {
    id: 'reports',
    title: 'Handle Reports',
    icon: MessageSquare,
    color: 'text-rose-600 bg-rose-50',
    steps: [
      '1. Open "Reports" in the sidebar to view incoming feedback sorted newest first.',
      '2. Filter by status ("New", "In Progress", "Resolved", "Rejected") or category, or search keywords.',
      '3. Click any report row to open the detail drawer and inspect the message and node location.',
      '4. Click "Open this location" to load the 360 viewer at the reported node coordinates.',
      '5. Under Status, click "In Progress", "Resolved", or "Rejected" to update the issue status.',
      '6. Enter an internal admin note and click "Save Internal Note" to record progress.',
      '7. To export for meetings, click "Export CSV" to download filtered reports with quoted text.',
      '8. To remove spam, click "Delete Report" and confirm the deletion prompt.',
    ],
  },
  {
    id: 'tags',
    title: 'Add or Edit Places and Tags',
    icon: MapPin,
    color: 'text-emerald-600 bg-emerald-50',
    steps: [
      '1. Open "Tags & Places" in the sidebar.',
      '2. To create a new place, click "Add Tag / Place" in the top action bar.',
      '3. In the modal, enter "Place / Tag Name", select Category, and choose Building & Floor.',
      '4. Enter the Door Node ID (e.g., "ab_046") or select from the node dropdown.',
      '5. Click "Save Tag" to persist the new point of interest to graph overrides.',
      '6. To update an existing place, find it in the table and click the pencil "Edit Place" button.',
      '7. Modify names, keywords, or node bindings, then click "Save Tag".',
      '8. To remove a tag, click the trash "Delete" icon and confirm in the dialog.',
    ],
  },
  {
    id: 'faculty-details',
    title: 'Edit Faculty Details and Emails',
    icon: Users,
    color: 'text-blue-600 bg-blue-50',
    steps: [
      '1. Open "Faculty Directory" in the sidebar to search all teaching staff.',
      '2. Use the search bar to locate a faculty member by name, department, or designation.',
      '3. Click the "Edit" button next to their record to open the edit dialog.',
      '4. Update official email, phone number, cabin room number, or designations.',
      '5. Ensure email matches the "@christcollegeijk.edu.in" domain format.',
      '6. Click "Save Changes" to persist updates directly to the directory.',
      '7. To add a new instructor, click "Add Faculty Member", fill details, and click "Save".',
    ],
  },
  {
    id: 'faculty-credentials',
    title: 'Create Faculty Accounts and Reset Passwords',
    icon: KeyRound,
    color: 'text-indigo-600 bg-indigo-50',
    steps: [
      '1. Open "Faculty Credentials" in the sidebar.',
      '2. Review faculty without credentials or filter by "Status: Missing".',
      '3. Click "Create Faculty Accounts" or "Generate Credentials" to provision logins.',
      '4. The system issues a secure temporary PIN for initial activation.',
      '5. To reset a forgotten password, locate the user and click "Reset Password".',
      '6. Confirm the reset dialog; a new temporary PIN will be generated for the teacher.',
      '7. Faculty must change their temporary password upon first portal sign-in.',
    ],
  },
  {
    id: 'email-sync',
    title: 'Export Missing Emails & Import College Reply',
    icon: FileSpreadsheet,
    color: 'text-purple-600 bg-purple-50',
    steps: [
      '1. Navigate to "Faculty Credentials" in the sidebar.',
      '2. Click "Export Missing (CSV)" to download all faculty records lacking email addresses.',
      '3. Send the generated CSV spreadsheet to the college administrative office for completion.',
      '4. When the office replies with the completed CSV, click "Import Email CSV".',
      '5. Click "Upload CSV" and select the returned spreadsheet file.',
      '6. Review the validation summary (accepted vs rejected email rows).',
      '7. Click "Process & Save Updates" to bulk-assign official emails to faculty profiles.',
    ],
  },
  {
    id: 'connections',
    title: 'Edit Map Connections',
    icon: Link2,
    color: 'text-teal-600 bg-teal-50',
    steps: [
      '1. Open "Panoramas & Headings" from the sidebar.',
      '2. Select the source panorama node from the list or map dropdown.',
      '3. Under Navigation Connections, inspect the list of connected neighbor nodes.',
      '4. Adjust the relative Direction dropdown (e.g., "NORTH", "FORWARD", "RIGHT").',
      '5. Toggle status between "UNKNOWN" and "VERIFIED" once direction is field-confirmed.',
      '6. To link a new node, click "+ Add Connection", enter Target Node ID and heading angle.',
      '7. Click "Save" to record overrides, or trash icon to remove invalid links.',
    ],
  },
  {
    id: 'panoramas',
    title: 'How to Add New Panorama Photos',
    icon: Camera,
    color: 'text-amber-600 bg-amber-50',
    steps: [
      '1. Photo Spec: Capture 360 equirectangular image, resize to 3072x1536, compress MozJPEG.',
      '2. Upload: Add file to repository at "client/public/assets/panoramas/<CATEGORY>/<filename>.jpg".',
      '3. Code Registration: Open "client/src/data/campusGraph.ts" and add the new node object.',
      '4. Specify unique node ID (e.g., "ab_105"), title, floor, coordinates, and default yaw.',
      '5. Define initial connections linking to adjacent existing nodes.',
      '6. In Control Center "Panoramas & Headings", adjust fine heading angles and manual number.',
      '7. Known Gap: There is no UI form to upload raw image files or register new node IDs directly.',
    ],
  },
  {
    id: 'backups',
    title: 'Monthly Database Backup',
    icon: Download,
    color: 'text-cyan-600 bg-cyan-50',
    steps: [
      '1. Open "Publish" in the sidebar.',
      '2. Under "Database Backup & Export", click "Download Backup (JSON — Hashes Excluded)".',
      '3. This saves a sanitized JSON export of campus geometry, nodes, tags, and directory.',
      '4. For authoritative full backups including password hashes, run the CLI tool on your PC:',
      '5. Command: npx tsx scripts/backupFirestore.ts --out C:\\SafeBackups\\CampNav',
      '6. Verify the backup timestamp and file size in your external secure storage.',
      '7. Store backups outside OneDrive and Git repositories to protect privacy.',
      '8. Note: Disk snapshot rollback is superseded by Firestore; recovery uses CLI backup JSONs.',
    ],
  },
  {
    id: 'safety',
    title: 'What NOT to Do (Security & Integrity)',
    icon: AlertTriangle,
    color: 'text-red-600 bg-red-50',
    steps: [
      '1. NEVER run the local server with real production credentials while experimenting.',
      '2. NEVER share ADMIN_PASSWORD, ADMIN_EMERGENCY_PIN, JWT_SECRET, or Firebase service account keys with anyone.',
      '3. NEVER enable admin mode or expose admin endpoints on the live Render deployment.',
      '4. Admin stays disabled on Render as long as ADMIN_PASSWORD and ADMIN_EMERGENCY_PIN are NOT set.',
      '5. NEVER commit service-account.json or .env secret keys to public or private Git branches.',
      '6. NEVER bypass delete confirmations or hard-delete nodes without checking linked connections.',
      '7. NEVER modify live Firestore rules without verifying through security tests.',
    ],
  },
];

export const HelpSection: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredGuides = GUIDES.filter((guide) => {
    const query = searchQuery.toLowerCase();
    return (
      guide.title.toLowerCase().includes(query) ||
      guide.steps.some((s) => s.toLowerCase().includes(query))
    );
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6 text-slate-800 animate-in fade-in duration-200">
      {/* Header */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#1a56db] flex items-center justify-center shrink-0">
            <HelpCircle className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">Admin Guide & Help</h1>
            <p className="text-xs text-slate-500">
              Plain-language, step-by-step instructions with verified UI labels
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search help topics..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:border-blue-500 focus:bg-white transition"
          />
        </div>
      </div>

      {/* Guide Cards Grid */}
      <div className="space-y-3">
        {filteredGuides.map((guide) => {
          const Icon = guide.icon;
          const isExpanded = expandedId === guide.id || searchQuery.length > 0;

          return (
            <div
              key={guide.id}
              className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden transition-all duration-150"
            >
              <button
                type="button"
                onClick={() => setExpandedId(expandedId === guide.id ? null : guide.id)}
                className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-slate-50/80 transition cursor-pointer"
              >
                <div className="flex items-center space-x-3.5">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${guide.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">{guide.title}</h2>
                    <span className="text-[11px] text-slate-400">
                      {guide.steps.length} practical steps
                    </span>
                  </div>
                </div>

                <div className="text-slate-400 p-1">
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>

              {isExpanded && (
                <div className="px-5 pb-5 pt-1 border-t border-slate-100 bg-slate-50/40">
                  <ol className="space-y-1.5 pt-2">
                    {guide.steps.map((step, idx) => (
                      <li
                        key={idx}
                        className="text-xs text-slate-700 leading-relaxed font-sans pl-1"
                      >
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          );
        })}

        {filteredGuides.length === 0 && (
          <div className="p-8 text-center bg-white border border-slate-200 rounded-2xl">
            <p className="text-xs text-slate-500">No guide topics matched &ldquo;{searchQuery}&rdquo;</p>
          </div>
        )}
      </div>
    </div>
  );
};
