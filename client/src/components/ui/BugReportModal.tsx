import React, { useState, useEffect } from 'react';
import {
  AlertCircle,
  X,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Send,
  Loader2,
  Compass,
  MapPin,
  Building2,
  Layers,
  Sparkles,
  Info,
  Shield,
  HelpCircle,
} from 'lucide-react';
import { useNavigation } from '../../context/NavigationContext';
import { ApiService } from '../../services/api';
import { CampusReport, CampusReportIssueType } from '../../../../shared/types';
import { BAKED_MANUAL_NUMBERS } from '../../data/defaultGraphOverrides';
import { CAMPUS_GRAPH_MAP, AREA_LABELS } from '../../data/campusGraph';
import { CAMPUS_BLOCKS_INFO } from '../../data/campusBlocksData';

interface BugReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialContext?: Partial<CampusReport>;
}

const ISSUE_TYPE_OPTIONS: { value: CampusReportIssueType; label: string; icon: string }[] = [
  { value: 'WRONG_LOCATION', label: 'Wrong Location / Pin', icon: '📍' },
  { value: 'WRONG_DEPARTMENT', label: 'Wrong Department Mapping', icon: '🏛️' },
  { value: 'WRONG_ROOM', label: 'Wrong Room Number / Code', icon: '🚪' },
  { value: 'WRONG_BLOCK', label: 'Wrong Building / Block', icon: '🏢' },
  { value: 'WRONG_NAVIGATION', label: 'Wrong Navigation Route / Direction', icon: '🧭' },
  { value: 'WRONG_ARROW', label: 'Wrong 360° Arrow Direction', icon: '↗️' },
  { value: 'MISSING_PLACE', label: 'Missing Place / Unmapped Room', icon: '➕' },
  { value: 'INCORRECT_TAG', label: 'Incorrect Tag or Label in 360°', icon: '🏷️' },
  { value: 'FACULTY_INFO', label: 'Faculty Information Outdated', icon: '👤' },
  { value: 'PANORAMA_PROBLEM', label: 'Panorama Image Not Loading / Blurry', icon: '📷' },
  { value: 'SEARCH_PROBLEM', label: 'Search Not Finding What I Need', icon: '🔍' },
  { value: 'TECHNICAL_PROBLEM', label: 'App Glitch or Technical Bug', icon: '⚙️' },
  { value: 'SUGGESTION', label: 'Feature Suggestion or Campus Idea', icon: '💡' },
  { value: 'OTHER', label: 'Other Issue / General Feedback', icon: '💬' },
];

export const BugReportModal: React.FC<BugReportModalProps> = ({
  isOpen,
  onClose,
  initialContext,
}) => {
  const {
    activePanorama,
    activeFloorNumber,
    selectedDestination,
    previewDestination,
    activeRoute,
    isNavigating,
    scannedBlockId,
  } = useNavigation();

  const [issueType, setIssueType] = useState<CampusReportIssueType>(
    initialContext?.issueType || 'WRONG_LOCATION'
  );
  const [description, setDescription] = useState(initialContext?.description || '');
  const [reporterName, setReporterName] = useState(initialContext?.reporterName || '');
  const [reporterContact, setReporterContact] = useState(initialContext?.reporterContact || '');
  const [showContextDetails, setShowContextDetails] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submittedReportId, setSubmittedReportId] = useState<string | null>(null);

  // Sync initialContext when modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialContext?.issueType) {
        setIssueType(initialContext.issueType);
      }
      if (initialContext?.description) {
        setDescription(initialContext.description);
      }
      setErrorMessage(null);
      setSubmittedReportId(null);
    }
  }, [isOpen, initialContext]);

  if (!isOpen) return null;

  // Auto-captured context
  const activeDest = selectedDestination || previewDestination;
  const currentPanoId = initialContext?.currentPanoramaId || activePanorama?.id;
  const currentNodeId = initialContext?.currentNodeId || activePanorama?.id;
  const currentBlockId = initialContext?.blockId || initialContext?.currentBuildingId || activePanorama?.buildingId || scannedBlockId;
  const currentFloorId = initialContext?.currentFloorId !== undefined ? initialContext.currentFloorId : activeFloorNumber;
  const currentRouteId = initialContext?.routeId || (isNavigating && activeRoute && activeRoute.pathNodes?.length > 0 ? `${activeRoute.pathNodes[0]?.id}->${activeRoute.pathNodes[activeRoute.pathNodes.length - 1]?.id}` : undefined);
  const originNodeId = initialContext?.originNodeId || (activeRoute?.pathNodes?.[0]?.id);
  const destinationNodeId = initialContext?.destinationNodeId || (activeRoute?.pathNodes && activeRoute.pathNodes.length > 0 ? activeRoute.pathNodes[activeRoute.pathNodes.length - 1]?.id : undefined);

  const nodeInfo = currentNodeId ? CAMPUS_GRAPH_MAP.get(currentNodeId) : null;
  const photoNumber = currentNodeId ? (BAKED_MANUAL_NUMBERS[currentNodeId] || currentNodeId) : undefined;
  const resolvedBlockName = initialContext?.blockName || (nodeInfo?.area ? AREA_LABELS[nodeInfo.area] : (currentBlockId ? CAMPUS_BLOCKS_INFO[currentBlockId]?.name : undefined));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || description.trim().length < 5) {
      setErrorMessage('Please provide a description with at least 5 characters.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const payload: Partial<CampusReport> = {
        issueType,
        category: ISSUE_TYPE_OPTIONS.find((o) => o.value === issueType)?.label || issueType,
        description: description.trim(),
        reporterName: reporterName.trim() || undefined,
        reporterContact: reporterContact.trim() || undefined,
        reporterType: 'student',

        currentPanoramaId: currentPanoId || undefined,
        currentNodeId: currentNodeId || undefined,
        currentBuildingId: currentBlockId ? String(currentBlockId) : undefined,
        currentFloorId: currentFloorId !== undefined ? currentFloorId : undefined,
        currentPlaceId: initialContext?.currentPlaceId || activeDest?.id || undefined,
        currentTagId: initialContext?.currentTagId || undefined,
        selectedDestinationId: activeDest?.id || undefined,
        routeId: currentRouteId,
        routeStepIndex: initialContext?.routeStepIndex,
        originNodeId: originNodeId || undefined,
        destinationNodeId: destinationNodeId || undefined,
        reportedEntityType: initialContext?.reportedEntityType || activeDest?.type || undefined,
        reportedEntityId: initialContext?.reportedEntityId || activeDest?.title || undefined,
        blockId: currentBlockId ? String(currentBlockId) : undefined,
        blockName: resolvedBlockName,

        currentURL: typeof window !== 'undefined' ? window.location.href : undefined,
        device: typeof navigator !== 'undefined' ? (navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Desktop') : undefined,
        browser: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        screenSize: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : undefined,
        appVersion: '2.0.0',
      };

      const result = await ApiService.submitCampusReport(payload);
      setSubmittedReportId(result.report.id);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to submit report. Please check your network connection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetAndClose = () => {
    setDescription('');
    setReporterName('');
    setReporterContact('');
    setSubmittedReportId(null);
    setErrorMessage(null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-2.5 sm:p-4 bg-black/60 backdrop-blur-xs animate-fade-in pointer-events-auto pb-safe"
      onClick={handleResetAndClose}
    >
      <div
        className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-6 max-w-lg w-full shadow-2xl animate-slide-up max-h-[88dvh] flex flex-col relative overflow-hidden text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={handleResetAndClose}
          aria-label="Close Bug Report"
          className="absolute top-3.5 right-3.5 sm:top-4 sm:right-4 text-slate-400 hover:text-slate-700 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-all border border-slate-200 active:scale-95 z-10"
          title="Close"
        >
          <X size={16} />
        </button>

        {/* Header */}
        <div className="flex items-start gap-3 mb-3 pr-8 flex-shrink-0">
          <div className="w-11 h-11 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center flex-shrink-0 shadow-xs">
            <AlertCircle size={22} />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black text-[#1e3a5f] leading-tight">
              Report an Issue / Feedback
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 leading-snug">
              Notice a wrong room, arrow, department, or broken location? Let our campus mapping team know.
            </p>
          </div>
        </div>

        {/* Content Body */}
        <div
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          className="flex-1 overflow-y-auto overscroll-contain pr-1 space-y-3.5 min-h-0 text-xs no-scrollbar touch-pan-y"
        >
          {submittedReportId ? (
            /* ──────────────── SUCCESS CONFIRMATION ──────────────── */
            <div className="py-6 px-4 text-center space-y-4 animate-scale-up">
              <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
                <CheckCircle2 size={32} />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-[#1e3a5f]">Thank You!</h3>
                <p className="text-slate-600 text-xs mt-1">Your report has been successfully submitted to the campus administrator.</p>
              </div>

              <p className="text-[11px] text-slate-500 max-w-sm mx-auto leading-relaxed">
                Our team will investigate the 360° panoramas, arrow trajectories, and tags for this campus location. Thank you for keeping WayCampus accurate!
              </p>

              <button
                onClick={handleResetAndClose}
                className="w-full py-2.5 px-4 rounded-xl bg-[#2563eb] hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition-all active:scale-98"
              >
                Return to Campus Navigation
              </button>
            </div>
          ) : (
            /* ──────────────── REPORT FORM ──────────────── */
            <form onSubmit={handleSubmit} className="space-y-3.5">
              {/* Issue Type Dropdown */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  What kind of issue are you reporting?
                </label>
                <div className="relative">
                  <select
                    value={issueType}
                    onChange={(e) => setIssueType(e.target.value as CampusReportIssueType)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 text-xs font-medium appearance-none focus:outline-none focus:border-blue-500 pr-8 transition-colors"
                  >
                    {ISSUE_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value} className="bg-white text-slate-800">
                        {opt.icon} {opt.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={14}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-slate-700">
                    Description <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] text-slate-400">{description.length} / 2000</span>
                </div>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Tell us what is wrong, e.g. 'Room AB13 is labeled on the wrong corridor' or 'The arrow points into a wall'..."
                  maxLength={2000}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800 placeholder-slate-400 text-xs focus:outline-none focus:border-blue-500 transition-colors resize-none"
                  required
                />
              </div>

              {/* Optional Contact Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                    Your Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={reporterName}
                    onChange={(e) => setReporterName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 text-xs focus:outline-none focus:border-blue-500 transition-colors"
                    placeholder="Student / Faculty name"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                    Contact / Email (Optional)
                  </label>
                  <input
                    type="text"
                    value={reporterContact}
                    onChange={(e) => setReporterContact(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 text-xs focus:outline-none focus:border-blue-500 transition-colors"
                    placeholder="Phone or @christcollegeijk.edu.in"
                  />
                </div>
              </div>

              {/* Automatic Context Disclosure */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowContextDetails(!showContextDetails)}
                  className="w-full px-3 py-2 flex items-center justify-between text-slate-600 hover:text-slate-900 text-[10px] font-bold transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <Compass size={12} className="text-[#2563eb]" />
                    <span>Auto-Captured Location Context</span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-700">
                      Attached
                    </span>
                  </div>
                  {showContextDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>

                {showContextDetails && (
                  <div className="p-3 pt-1 border-t border-slate-200/80 space-y-1.5 text-[10px] text-slate-600">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-slate-400 font-medium">Panorama:</span>{' '}
                        <span className="text-slate-700 font-mono">
                          {currentPanoId ? (BAKED_MANUAL_NUMBERS[currentPanoId] ? `Photo #${BAKED_MANUAL_NUMBERS[currentPanoId]} (${currentPanoId})` : currentPanoId) : 'None'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium">Block:</span>{' '}
                        <span className="text-slate-700 font-mono">{resolvedBlockName || currentBlockId || 'None'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium">Floor:</span>{' '}
                        <span className="text-slate-700">{currentFloorId !== undefined ? `Floor ${currentFloorId}` : 'None'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium">Destination:</span>{' '}
                        <span className="text-slate-700 truncate">{activeDest?.title || 'None'}</span>
                      </div>
                    </div>
                    {originNodeId && destinationNodeId && (
                      <div>
                        <span className="text-slate-400 font-medium">Route:</span>{' '}
                        <span className="text-slate-700 font-mono truncate">{originNodeId} → {destinationNodeId}</span>
                      </div>
                    )}
                    <p className="text-[9px] text-slate-400 italic mt-1">
                      This diagnostic data helps administrators quickly locate the exact 360° node or navigation arrow without needing you to describe coordinates.
                    </p>
                  </div>
                )}
              </div>

              {/* Error Message */}
              {errorMessage && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle size={14} className="flex-shrink-0 text-rose-500" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting || description.trim().length < 5}
                className="w-full py-2.5 px-4 rounded-xl bg-[#2563eb] hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 transition-all active:scale-98"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Submitting Report...</span>
                  </>
                ) : (
                  <>
                    <Send size={13} />
                    <span>Submit Report</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
