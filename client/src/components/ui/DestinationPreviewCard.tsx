import React from 'react';
import { Navigation, Compass, X, Clock, Footprints, CheckCircle2, ArrowRight, Check } from 'lucide-react';
import { SearchResult, RouteResult } from '../../../../shared/types';
import { useNavigation } from '../../context/NavigationContext';
import { ShareRouteButton } from './ShareRouteButton';

interface DestinationPreviewCardProps {
  destination: SearchResult;
  route: RouteResult | null;
  onStartVirtualWalk: () => void;
  onStartLiveNavigation: () => void;
  onClose: () => void;
}

export const DestinationPreviewCard: React.FC<DestinationPreviewCardProps> = ({
  destination,
  route,
  onStartVirtualWalk,
  onStartLiveNavigation,
  onClose,
}) => {
  const { availableRoutes, selectedRouteIndex, selectRouteByIndex, userNodeId, userLocationLabel } = useNavigation();

  // Active route chosen by user (defaults to index 0: shortest way)
  const currentSelectedRoute = availableRoutes[selectedRouteIndex] || availableRoutes[0];

  const distance = currentSelectedRoute
    ? currentSelectedRoute.totalDistanceMeters
    : route?.totalDistanceMeters || destination.distanceMeters || 145;

  const timeMin = currentSelectedRoute?.estimatedDurationMinutes ?? Math.max(1, Math.round(distance / 70));

  const totalSteps = currentSelectedRoute ? currentSelectedRoute.totalSteps : Math.max(1, Math.round(distance / 12));

  // Breadcrumb path construction
  const buildingLabel = destination.buildingName || 'MG Block';
  const floorLabel =
    destination.floorNumber !== undefined
      ? destination.floorNumber === 0
        ? 'Ground Floor'
        : `Floor ${destination.floorNumber}`
      : 'Ground Floor';

  return (
    <div className="fixed bottom-2 sm:bottom-5 left-2 right-2 sm:left-4 sm:right-4 md:left-1/2 md:-translate-x-1/2 md:max-w-md z-40 animate-slide-up pb-safe pointer-events-auto">
      <div className="bg-white/98 backdrop-blur-2xl border border-slate-200/90 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 shadow-2xl relative overflow-hidden max-h-[46dvh] sm:max-h-[60dvh] overflow-y-auto overscroll-contain text-slate-800">
        {/* Subtle Ambient Glow */}
        <div className="absolute -top-16 -right-16 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-2.5 right-2.5 sm:top-3.5 sm:right-3.5 text-slate-400 hover:text-slate-700 p-1 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors"
          title="Close destination"
        >
          <X size={15} />
        </button>

        {/* Destination Title & Header */}
        <div className="pr-7 mb-1.5 sm:mb-2">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <span className="text-[9px] font-black uppercase tracking-wider text-[#2563eb]">
              {destination.category || destination.type}
            </span>
            <span className="text-slate-300">•</span>
            {destination.isLocationVerified !== false ? (
              <span className="text-[9px] font-semibold text-emerald-600 flex items-center gap-0.5">
                <CheckCircle2 size={10} /> Verified
              </span>
            ) : (
              <span className="text-[9px] font-semibold text-amber-600">Location unmapped</span>
            )}
          </div>

          <h2 className="text-sm sm:text-base font-black text-[#1e3a5f] leading-tight tracking-tight truncate">
            {destination.title}
          </h2>

          <p className="text-[11px] text-slate-500 font-medium mt-0.5 truncate">
            {destination.subtitle || `${buildingLabel} · ${floorLabel}`}
          </p>
        </div>

        {/* Divider */}
        <div className="h-px bg-slate-100 my-1.5 sm:my-2" />

        {/* ─────────────────────────────────────────────────────────────
            MULTI-ROUTE SELECTION: Show All Ways (Shortest + Alternatives)
           ───────────────────────────────────────────────────────────── */}
        {availableRoutes.length > 1 ? (
          <div className="mb-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-slate-700 flex items-center gap-1">
                <Compass size={12} className="text-blue-600" />
                Routes ({availableRoutes.length} Ways Found)
              </span>
              <span className="text-[8px] text-slate-400 font-medium">Select preferred way</span>
            </div>

            <div className="flex flex-col gap-1.5">
              {availableRoutes.map((r, idx) => {
                const isSelected = idx === selectedRouteIndex;
                const isShortest = r.isShortest || idx === 0;

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => selectRouteByIndex(idx)}
                    className={`w-full text-left p-2 sm:p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'bg-blue-50/90 border-blue-500 ring-1 ring-blue-500/40 shadow-xs'
                        : 'bg-slate-50 border-slate-200/90 hover:border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                        <span
                          className={`text-[8px] sm:text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full border ${
                            isShortest
                              ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                              : 'bg-blue-100 text-blue-700 border-blue-300'
                          }`}
                        >
                          {isShortest ? '★ SHORTEST' : r.routeLabel || `WAY ${idx + 1}`}
                        </span>

                        <span className="text-[9px] text-slate-500 font-medium">
                          {r.totalDistanceMeters}m • ≈{r.estimatedDurationMinutes ?? Math.max(1, Math.round(r.estimatedWalkTimeSeconds / 60))} min • {r.totalSteps} steps
                        </span>
                      </div>

                      <p className="text-[11px] font-bold text-slate-800 truncate leading-snug">
                        {r.routeDescription || `${r.totalSteps} steps navigation`}
                      </p>
                    </div>

                    <div className="flex items-center justify-center flex-shrink-0">
                      <div
                        className={`w-4 h-4 rounded-full flex items-center justify-center border transition-all ${
                          isSelected
                            ? 'bg-[#2563eb] border-[#2563eb] text-white'
                            : 'border-slate-300 text-transparent'
                        }`}
                      >
                        <Check size={10} strokeWidth={3} />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          /* Single Route Distance & Time Summary */
          <div className="flex items-center justify-between py-0.5 mb-1.5 text-slate-600">
            <div className="flex items-center gap-1.5">
              <Footprints size={14} className="text-[#2563eb]" />
              <span className="text-xs sm:text-sm font-black text-slate-800">{distance} m</span>
              <span className="text-[9px] text-slate-400">({totalSteps} steps)</span>
            </div>

            <div className="flex items-center gap-1 text-[11px] text-slate-500 font-semibold">
              <Clock size={11} className="text-amber-500" />
              <span>≈ {timeMin} min walk</span>
            </div>
          </div>
        )}

        {/* Route Steps Breadcrumb (Google Maps Style) */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-xl py-1 px-2.5 mb-2.5 flex items-center gap-1 overflow-x-auto text-[9px] sm:text-[10px] font-bold text-slate-600 no-scrollbar">
          <span className="whitespace-nowrap text-slate-400">Start</span>
          <ArrowRight size={10} className="text-[#2563eb] flex-shrink-0" />
          {currentSelectedRoute?.routeDescription ? (
            <>
              <span className="whitespace-nowrap text-emerald-700 font-medium truncate max-w-[140px]">
                {currentSelectedRoute.routeDescription}
              </span>
              <ArrowRight size={10} className="text-[#2563eb] flex-shrink-0" />
            </>
          ) : (
            <>
              <span className="whitespace-nowrap text-slate-600">{buildingLabel}</span>
              <ArrowRight size={10} className="text-[#2563eb] flex-shrink-0" />
            </>
          )}
          <span className="whitespace-nowrap text-[#2563eb] truncate">{destination.title.split('•')[0].trim()}</span>
        </div>

        {/* Primary Action: Modern Guided Navigation Button & Share Button */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onStartVirtualWalk}
            className="flex-1 h-10 sm:h-11 px-3 sm:px-4 rounded-xl bg-[#2563eb] hover:bg-blue-700 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/25 active:scale-[0.98] transition-all truncate group"
          >
            <Navigation size={15} className="text-white group-hover:rotate-12 transition-transform flex-shrink-0" />
            <span className="truncate">
              {currentSelectedRoute?.isShortest
                ? `Start Navigation (${distance}m)`
                : `Start Navigation (${distance}m)`}
            </span>
            <ArrowRight size={14} className="text-white group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
          </button>

          <ShareRouteButton
            destinationTitle={destination.title}
            startNodeId={userNodeId}
            startLabel={userLocationLabel}
            compact={true}
            className="h-10 sm:h-11 w-10 sm:w-11 px-0 rounded-xl flex items-center justify-center flex-shrink-0 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700"
          />
        </div>
      </div>
    </div>
  );
};
