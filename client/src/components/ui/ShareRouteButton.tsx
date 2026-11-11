import React, { useState } from 'react';
import { Share2, Check } from 'lucide-react';

interface ShareRouteButtonProps {
  destinationTitle: string;
  startNodeId?: string;
  startLabel?: string;
  className?: string;
  compact?: boolean;
}

export const ShareRouteButton: React.FC<ShareRouteButtonProps> = ({
  destinationTitle,
  startNodeId,
  startLabel,
  className = '',
  compact = false,
}) => {
  const [copied, setCopied] = useState(false);

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const cleanTitle = destinationTitle.split('•')[0].trim();
    let shareUrl = `${origin}/?to=${encodeURIComponent(cleanTitle)}`;
    if (startNodeId && startNodeId !== 'outdoor_001') {
      shareUrl += `&from=${encodeURIComponent(startNodeId)}`;
    }

    const shareData = {
      title: `${cleanTitle} — Christ College Irinjalakuda`,
      text: `🧭 Navigate to ${cleanTitle}${startLabel ? ` starting from ${startLabel}` : ''} at Christ College via 360° Street View:`,
      url: shareUrl,
    };

    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.warn('Navigator share error, falling back to clipboard:', err);
        } else {
          return;
        }
      }
    }

    // Fallback to clipboard
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Fallback prompt if clipboard fails
      window.prompt('Copy this route link:', shareUrl);
    }
  };

  if (compact) {
    return (
      <button
        onClick={handleShare}
        className={`p-2 rounded-xl flex items-center justify-center transition-all ${
          copied
            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
            : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-white/10'
        } ${className}`}
        title={copied ? 'Route link copied!' : 'Share Route (WhatsApp / Link)'}
      >
        {copied ? <Check size={14} className="text-emerald-400" /> : <Share2 size={14} />}
      </button>
    );
  }

  return (
    <button
      onClick={handleShare}
      className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-md active:scale-95 ${
        copied
          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
          : 'bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-white/10'
      } ${className}`}
      title="Share route link via WhatsApp or copy URL"
    >
      {copied ? (
        <>
          <Check size={14} className="text-emerald-400" />
          <span className="text-emerald-300">Link Copied!</span>
        </>
      ) : (
        <>
          <Share2 size={14} className="text-sky-400" />
          <span>Share Route</span>
        </>
      )}
    </button>
  );
};
