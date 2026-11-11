import React, { useState, useEffect, useRef } from 'react';
import { NavigationProvider, useNavigation } from './context/NavigationContext';
import { DestinationPreviewCard } from './components/ui/DestinationPreviewCard';
import { QRScannerModal } from './components/ar/QRScannerModal';
import { WhereAmIModal } from './components/ui/WhereAmIModal';
import { SearchPanel } from './components/ui/SearchPanel';
import { BottomBar } from './components/ui/BottomBar';
import { WayCampusControlCenter } from './components/control-center/WayCampusControlCenter';
import { ScannedBlockSidePanel } from './components/ui/ScannedBlockSidePanel';
import { BugReportModal } from './components/ui/BugReportModal';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { SearchResult } from '../../shared/types';
import { CAMPUS_BLOCKS_INFO } from './data/campusBlocksData';
import { searchCampusPlaces } from './data/campusPlaces';
import { InstallPrompt } from './components/ui/InstallPrompt';
import { isLocalhost, sanitizeProductionUrl, isAdminAuthenticated } from './utils/security';
import { SplashScreen } from './components/screens/SplashScreen';
import { HomeScreen } from './components/screens/HomeScreen';
import { TourScreen } from './components/screens/TourScreen';
import { MoreMenu } from './components/ui/MoreMenu';
import { FacultyPortalModal } from './components/faculty/FacultyPortalModal';
import { SearchCategoryFilter } from './services/campusSearchService';

const AppContent: React.FC = () => {
  const {
    viewMode,
    setViewMode,
    setVisualMode,
    activePanorama,
    panoramas,
    setActivePanoramaId,
    previewDestination,
    selectedDestination,
    activeRoute,
    isNavigating,
    startVirtualWalk,
    startLiveWalk,
    stopNavigation,
    setActiveFloorNumber,
    isQRScannerOpen,
    setIsQRScannerOpen,
    isWhereAmIOpen,
    setIsWhereAmIOpen,
    setUserStartingPoint,
    cameraHeading,
    setCameraHeading,
    scannedBlockId,
    setScannedBlockId,
    startNavigationRoute,
    isReportModalOpen,
    closeReportModal,
    reportInitialContext,
    activeTab,
    setActiveTab,
    isMoreMenuOpen,
    setIsMoreMenuOpen,
    isFacultyPortalOpen,
    setIsFacultyPortalOpen,
  } = useNavigation();

  const [showSplash, setShowSplash] = useState<boolean>(true);

  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [searchCategory, setSearchCategory] = useState<SearchCategoryFilter>('ALL');

  // Guard ref to ensure URL deep-linking only fires once on initial mount
  const hasParsedUrlRef = useRef(false);

  // Universal URL Deep-Linking & QR Code Handling (RUNS ONCE on mount only)
  useEffect(() => {
    if (hasParsedUrlRef.current) return;
    hasParsedUrlRef.current = true;

    const urlParams = new URLSearchParams(window.location.search);
    let hasDeepLink = false;

    // 1. Direct Panorama Deep-Link (?pano=outdoor_012 or ?node=mg_004)
    const panoParam = urlParams.get('pano') || urlParams.get('node');
    if (panoParam) {
      setActivePanoramaId(panoParam);
      setVisualMode('STREET_VIEW');
      setViewMode('HOME');
      setActiveTab('360_TOUR');
      hasDeepLink = true;
    }

    // 2. Door QR Code or Block Landmark (?qr=QR-MG or ?block=mg)
    const qrParam = urlParams.get('qr') || urlParams.get('block');
    if (qrParam) {
      const code = qrParam.toUpperCase();
      const mappedBuilding =
        code.includes('BPE') || code.includes('SPORT') || code.includes('STADIUM') || code.includes('GYM') ? 'bld_bpe' :
        code.includes('GB') || code.includes('BBA') || code.includes('MANAGEMENT') ? 'bld_bba' :
        code.includes('GATE') ? 'bld_gate' :
        code.includes('AUD') ? 'bld_aud' :
        code.includes('MG') || code === 'MAIN' ? 'bld_main' :
        code.includes('AB') || code === 'ADMIN' ? 'bld_ab' :
        code.includes('SM') || code === 'COMMERCE' ? 'bld_sm' :
        code.includes('SJ') || code === 'SCIENCE' ? 'bld_sj' :
        code.includes('SC') || code === 'RESEARCH' ? 'bld_sc' :
        code.includes('LF') || code.includes('HM') || code.includes('HOTEL') ? 'bld_hm' :
        code.includes('MT') ? 'bld_mt' :
        code.includes('SB') ? 'bld_sb' : 'bld_main';

      setScannedBlockId(mappedBuilding);

      const blockInfo = CAMPUS_BLOCKS_INFO[mappedBuilding];
      if (blockInfo?.entranceNodeId) {
        setActivePanoramaId(blockInfo.entranceNodeId);
        setUserStartingPoint(blockInfo.entranceNodeId, blockInfo.name);
        setVisualMode('STREET_VIEW');
        setViewMode('HOME');
        setActiveTab('360_TOUR');
      }
      hasDeepLink = true;
    }

    // 3. Shareable Navigation Route Links (?to=SM-153 or ?to=canteen&from=gate1)
    const toParam = urlParams.get('to') || urlParams.get('dest');
    const fromParam = urlParams.get('from') || urlParams.get('start');
    if (toParam) {
      const matches = searchCampusPlaces(toParam);
      if (matches.length > 0) {
        const place = matches[0];
        const destinationResult: SearchResult = {
          id: place.id,
          type: 'ROOM',
          title: place.name,
          subtitle: `${place.buildingName} • ${place.floor}`,
          buildingId: `bld_${place.building.toLowerCase()}`,
          buildingName: place.buildingName,
          floorId: `floor_${place.building.toLowerCase()}_${place.floorNumber}`,
          floorNumber: place.floorNumber,
          floorName: place.floor,
          nodeId: place.panoramaNodeId,
        };

        if (fromParam) {
          setUserStartingPoint(fromParam, fromParam.replace(/_/g, ' '));
        }

        // Auto-start guided Street View navigation
        startNavigationRoute(destinationResult, fromParam || undefined);
        setActiveTab('360_TOUR');
      }
      hasDeepLink = true;
    }

    // Clear deep-link URL params after processing to prevent re-triggers
    if (hasDeepLink) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Control Center & Debug Mode routing (strictly restricted to Localhost development with admin flag)
  const isAdminBuildEnabled = Boolean(import.meta.env.DEV || import.meta.env.VITE_ENABLE_ADMIN === 'true');

  useEffect(() => {
    if (!isLocalhost() || !isAdminBuildEnabled) {
      if (
        window.location.hash === '#admin' ||
        window.location.hash === '#debug' ||
        window.location.hash === '#control' ||
        window.location.search.includes('admin=true') ||
        window.location.search.includes('debug=true') ||
        window.location.search.includes('control=true')
      ) {
        window.history.replaceState({}, '', window.location.pathname);
      }
      return;
    }

    const search = window.location.search;
    const hash = window.location.hash;
    const path = window.location.pathname;

    if (search.includes('admin=true') || hash === '#admin' || path === '/admin' || path.startsWith('/admin')) {
      if (viewMode !== 'ADMIN') {
        setViewMode('ADMIN');
      }
      return;
    }

    if (search.includes('debug=true') || hash === '#debug' || search.includes('map=true') || search.includes('control=true') || hash === '#control') {
      if (viewMode !== 'ADMIN') {
        setViewMode('ADMIN');
      }
    }
  }, [viewMode, setViewMode]);

  // Handle splash completion
  const handleSplashComplete = () => {
    sessionStorage.setItem('waycampus_splash_seen', '1');
    setShowSplash(false);
  };

  // Open Search from anywhere
  const handleOpenSearch = (category?: string) => {
    if (category) {
      setSearchCategory(category as SearchCategoryFilter);
    } else {
      setSearchCategory('ALL');
    }
    setIsSearchOpen(true);
  };

  // ── PHONE HARDWARE / BROWSER NAVIGATION (STEP BACK SUPPORT) ──
  useEffect(() => {
    if (!window.history.state) {
      window.history.replaceState({ root: true }, '');
    }

    const handlePopState = () => {
      // Step back priority:
      // 1. Close open modals or overlays
      if (isSearchOpen) {
        setIsSearchOpen(false);
        return;
      }
      if (isQRScannerOpen) {
        setIsQRScannerOpen(false);
        return;
      }
      if (isWhereAmIOpen) {
        setIsWhereAmIOpen(false);
        return;
      }
      if (scannedBlockId) {
        setScannedBlockId(null);
        return;
      }
      if (isMoreMenuOpen) {
        setIsMoreMenuOpen(false);
        return;
      }
      if (isFacultyPortalOpen) {
        setIsFacultyPortalOpen(false);
        return;
      }
      if (isReportModalOpen) {
        closeReportModal();
        return;
      }

      // 2. Cancel active navigation route
      if (isNavigating) {
        stopNavigation();
        return;
      }

      // 3. Step back to Home tab if on Map or 360 Tour
      if (activeTab !== 'HOME') {
        setActiveTab('HOME');
        return;
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [
    isSearchOpen,
    isQRScannerOpen,
    isWhereAmIOpen,
    scannedBlockId,
    isMoreMenuOpen,
    isFacultyPortalOpen,
    isReportModalOpen,
    isNavigating,
    activeTab,
    setIsSearchOpen,
    setIsQRScannerOpen,
    setIsWhereAmIOpen,
    setScannedBlockId,
    setIsMoreMenuOpen,
    setIsFacultyPortalOpen,
    closeReportModal,
    stopNavigation,
    setActiveTab,
  ]);

  // Push history state whenever an overlay opens so phone back button steps back
  useEffect(() => {
    const isAnyOverlayOpen = Boolean(
      isSearchOpen ||
      isQRScannerOpen ||
      isWhereAmIOpen ||
      scannedBlockId ||
      isMoreMenuOpen ||
      isFacultyPortalOpen ||
      isReportModalOpen
    );

    if (isAnyOverlayOpen) {
      window.history.pushState({ modal: true }, '');
    }
  }, [
    isSearchOpen,
    isQRScannerOpen,
    isWhereAmIOpen,
    scannedBlockId,
    isMoreMenuOpen,
    isFacultyPortalOpen,
    isReportModalOpen,
  ]);

  // Push history state when tab transitions from HOME
  useEffect(() => {
    if (activeTab !== 'HOME') {
      window.history.pushState({ tab: activeTab }, '');
    }
  }, [activeTab]);

  // WayCampus Professional Control Center (Admin mode - strictly restricted to localhost)
  if ((viewMode === 'ADMIN' || viewMode === 'DEBUG') && isLocalhost() && isAdminBuildEnabled) {
    return (
      <ErrorBoundary fallbackTitle="WayCampus Control Center Encountered an Issue">
        <WayCampusControlCenter
          onClose={() => setViewMode('HOME')}
          activePanorama={activePanorama || panoramas[0]}
          panoramas={panoramas}
          onSelectPanorama={(id) => {
            setActivePanoramaId(id);
            const p = panoramas.find((item) => item.id === id);
            if (p) setActiveFloorNumber(p.floorNumber);
          }}
          cameraYaw={cameraHeading}
          cameraPitch={0}
          onSetCameraOrientation={(yaw) => {
            setCameraHeading(yaw);
          }}
        />
      </ErrorBoundary>
    );
  }

  return (
    <div className="fixed inset-0 w-full h-full h-[100dvh] flex flex-col bg-slate-50 text-slate-900 overflow-hidden">
      {/* 1. Branded Native Splash Screen */}
      {showSplash && <SplashScreen onComplete={handleSplashComplete} />}

      {/* 2. Primary Screen Switcher (HOME | MAP | 360° TOUR) */}
      <main className={`flex-1 relative overflow-hidden w-full h-full flex flex-col min-h-0 ${showSplash ? 'opacity-0 pointer-events-none' : 'opacity-100 transition-opacity duration-300'}`}>
        {/* If actively navigating, always render 360 Tour View with Navigation HUD */}
        {isNavigating ? (
          <TourScreen
            onBackToHome={() => setActiveTab('HOME')}
            onOpenBuildingInfo={(bldId) => setScannedBlockId(bldId)}
          />
        ) : (
          <>
            {activeTab === 'HOME' && <HomeScreen onOpenSearch={handleOpenSearch} />}
            {activeTab === '360_TOUR' && (
              <TourScreen
                onBackToHome={() => setActiveTab('HOME')}
                onOpenBuildingInfo={(bldId) => setScannedBlockId(bldId)}
              />
            )}
          </>
        )}

        {/* 3. Floating Search Overlay (Triggered by Search Bar on Home/Map) */}
        {isSearchOpen && (
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setIsSearchOpen(false);
              }
            }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex flex-col items-center justify-start p-3 sm:p-4 w-full h-full"
          >
            <div className="w-full max-w-lg">
              <SearchPanel
                isOpen={true}
                initialCategory={searchCategory}
                onClose={() => setIsSearchOpen(false)}
              />
            </div>
          </div>
        )}

        {/* 4. Destination Preview Card (When Search Result Selected) */}
        {viewMode === 'DESTINATION_CARD' && previewDestination && (
          <DestinationPreviewCard
            destination={previewDestination}
            route={activeRoute}
            onStartVirtualWalk={() => {
              startVirtualWalk(previewDestination);
              setActiveTab('360_TOUR');
            }}
            onStartLiveNavigation={() => {
              startLiveWalk(previewDestination);
              setActiveTab('360_TOUR');
            }}
            onClose={() => setViewMode('HOME')}
          />
        )}
      </main>

      {/* 5. Bottom Navigation (Only visible on HOME & MAP; Hidden in 360° Tour & Navigation for unobstructed view of arrows) */}
      {!isNavigating && !showSplash && activeTab !== '360_TOUR' && <BottomBar />}

      {/* 6. More Slide-Up Sheet Menu */}
      <MoreMenu
        isOpen={isMoreMenuOpen}
        onClose={() => setIsMoreMenuOpen(false)}
        onOpenDirectory={() => {
          setSearchCategory('BUILDINGS');
          setIsSearchOpen(true);
        }}
      />

      {/* 7. Faculty Portal Modal */}
      <FacultyPortalModal
        isOpen={isFacultyPortalOpen}
        onClose={() => setIsFacultyPortalOpen(false)}
      />

      {/* 8. Global QR Scanner Modal */}
      <QRScannerModal
        isOpen={isQRScannerOpen}
        onClose={() => setIsQRScannerOpen(false)}
        onLocationLocked={(nodeId, label, floor, buildingId) => {
          setUserStartingPoint(nodeId, label);
          setActiveFloorNumber(floor);
          setActivePanoramaId(nodeId);
          setVisualMode('STREET_VIEW');
          setViewMode('HOME');
          setActiveTab('360_TOUR');
          if (buildingId) {
            setScannedBlockId(buildingId);
          }
        }}
      />

      {/* 9. Scanned Block Full Details Side Panel */}
      {scannedBlockId && viewMode !== 'DESTINATION_CARD' && !isNavigating && (
        <ScannedBlockSidePanel
          buildingId={scannedBlockId}
          onClose={() => setScannedBlockId(null)}
        />
      )}

      {/* 10. Global Where Am I Modal */}
      <WhereAmIModal
        isOpen={isWhereAmIOpen}
        onClose={() => setIsWhereAmIOpen(false)}
        currentPanorama={activePanorama || panoramas[0]}
        onOpenQRScanner={() => setIsQRScannerOpen(true)}
        onOpenSearch={() => handleOpenSearch()}
      />

      {/* 11. Campus Bug Reporting & Feedback Modal */}
      <BugReportModal
        isOpen={isReportModalOpen}
        onClose={closeReportModal}
        initialContext={reportInitialContext}
      />

      {/* 12. PWA Install Prompt */}
      <InstallPrompt />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <NavigationProvider>
      <AppContent />
    </NavigationProvider>
  );
};

export default App;
