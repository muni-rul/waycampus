import fs from 'fs';
import path from 'path';

function runTests() {
  const root = path.resolve(__dirname, '../../');
  const tourNavBoxPath = path.join(root, 'client/src/components/ui/TourNavigationBox.tsx');
  const searchPanelPath = path.join(root, 'client/src/components/ui/SearchPanel.tsx');
  const destCardPath = path.join(root, 'client/src/components/ui/DestinationPreviewCard.tsx');
  const panoViewerPath = path.join(root, 'client/src/components/panorama/PanoramaViewer.tsx');

  const tourNavBox = fs.readFileSync(tourNavBoxPath, 'utf-8');
  const searchPanel = fs.readFileSync(searchPanelPath, 'utf-8');
  const destCard = fs.readFileSync(destCardPath, 'utf-8');
  const panoViewer = fs.readFileSync(panoViewerPath, 'utf-8');

  const results: { name: string; pass: boolean; error?: string }[] = [];

  // 1. TourNavigationBox: Outer box must not clip dropdowns with overflow-hidden
  {
    const hasOuterOverflowHidden = /bg-white\/95[^\n]*rounded-3xl[^\n]*overflow-hidden/.test(tourNavBox);
    const pass = !hasOuterOverflowHidden;
    results.push({
      name: 'TourNavigationBox: outer floating box does not have overflow-hidden clipping suggestions',
      pass,
      error: pass ? undefined : 'Outer box in TourNavigationBox still has overflow-hidden which clips dropdown results'
    });
  }

  // 2. TourNavigationBox: Suggestions dropdowns have touch-pan-y and stop wheel propagation
  {
    const hasTouchPanY = tourNavBox.includes('touch-pan-y');
    const stopsWheel = tourNavBox.includes('onWheel=') && tourNavBox.includes('stopPropagation');
    const pass = hasTouchPanY && stopsWheel;
    results.push({
      name: 'TourNavigationBox: suggestions dropdowns support touch-pan-y and stop wheel event bubbling',
      pass,
      error: pass ? undefined : `Missing touch-pan-y (${hasTouchPanY}) or onWheel stopPropagation (${stopsWheel})`
    });
  }

  // 3. TourNavigationBox: Suggestion items must not close on mousedown (which kills mobile touch scrolling)
  {
    // Check if suggestion items use onClick instead of onMouseDown for selection
    const destItemsCloseOnMouseDown = /destSuggestions\.map[\s\S]*?onMouseDown=\{[^}]*setIsDestFocused\(false\)/.test(tourNavBox);
    const destItemsCloseOnClick = /destSuggestions\.map[\s\S]*?onClick=\{[^}]*setIsDestFocused\(false\)/.test(tourNavBox);
    const pass = !destItemsCloseOnMouseDown && destItemsCloseOnClick;
    results.push({
      name: 'TourNavigationBox: suggestion item selection uses onClick rather than immediate onMouseDown',
      pass,
      error: pass ? undefined : 'Suggestion item selection uses onMouseDown which closes the list on touch-down before scroll begins'
    });
  }

  // 4. SearchPanel: Dropdown must not combine overflow-hidden with overflow-y-auto
  {
    const hasConflictingOverflow = /overflow-hidden[^\n]*max-h-\[50dvh\][^\n]*overflow-y-auto/.test(searchPanel);
    const pass = !hasConflictingOverflow;
    results.push({
      name: 'SearchPanel: dropdown container does not conflict overflow-hidden with overflow-y-auto',
      pass,
      error: pass ? undefined : 'SearchPanel dropdown has conflicting overflow-hidden and overflow-y-auto'
    });
  }

  // 5. SearchPanel: Dropdown has touch-pan-y and stops wheel propagation
  {
    const hasTouchPanY = searchPanel.includes('touch-pan-y');
    const stopsWheel = searchPanel.includes('onWheel=') && searchPanel.includes('stopPropagation');
    const pass = hasTouchPanY && stopsWheel;
    results.push({
      name: 'SearchPanel: dropdown has touch-pan-y and stops wheel event bubbling',
      pass,
      error: pass ? undefined : `Missing touch-pan-y (${hasTouchPanY}) or onWheel stopPropagation (${stopsWheel})`
    });
  }

  // 6. DestinationPreviewCard: Card must not combine overflow-hidden with overflow-y-auto
  {
    const hasConflictingOverflow = /overflow-hidden[^\n]*max-h-\[46dvh\][^\n]*overflow-y-auto/.test(destCard);
    const pass = !hasConflictingOverflow;
    results.push({
      name: 'DestinationPreviewCard: card does not conflict overflow-hidden with overflow-y-auto',
      pass,
      error: pass ? undefined : 'DestinationPreviewCard has conflicting overflow-hidden and overflow-y-auto'
    });
  }

  // 7. DestinationPreviewCard: Card supports touch-pan-y and stops wheel propagation
  {
    const hasTouchPanY = destCard.includes('touch-pan-y');
    const stopsWheel = destCard.includes('onWheel=') && destCard.includes('stopPropagation');
    const pass = hasTouchPanY && stopsWheel;
    results.push({
      name: 'DestinationPreviewCard: supports touch-pan-y and stops wheel event bubbling',
      pass,
      error: pass ? undefined : `Missing touch-pan-y (${hasTouchPanY}) or onWheel stopPropagation (${stopsWheel})`
    });
  }

  // 8. PanoramaViewer: Route step list supports touch-pan-y and stops wheel propagation
  {
    const hasStepListTouchPanY = /Full Route Steps[\s\S]*?touch-pan-y/.test(panoViewer) ||
      /max-h-60[^\n]*touch-pan-y/.test(panoViewer);
    const stopsWheelInStepList = /max-h-60[\s\S]*?onWheel=/.test(panoViewer) ||
      /Full Route Steps[\s\S]*?stopPropagation/.test(panoViewer);
    const pass = hasStepListTouchPanY && stopsWheelInStepList;
    results.push({
      name: 'PanoramaViewer: step list has touch-pan-y and stops wheel propagation inside touch-none canvas',
      pass,
      error: pass ? undefined : `Step list missing touch-pan-y (${hasStepListTouchPanY}) or onWheel stopPropagation (${stopsWheelInStepList})`
    });
  }

  console.log('=== SCROLL CONTRACT TESTS ===');
  let allPass = true;
  for (const r of results) {
    if (r.pass) {
      console.log(`PASS: ${r.name}`);
    } else {
      console.log(`FAIL: ${r.name} - ${r.error}`);
      allPass = false;
    }
  }

  if (!allPass) {
    process.exit(1);
  }
}

runTests();
