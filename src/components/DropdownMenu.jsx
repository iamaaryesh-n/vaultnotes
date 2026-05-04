import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * A highly-optimized, Instagram-style dropdown menu component.
 * Uses React Portal to avoid clipping and fixed positioning for instant rendering.
 */
export const DropdownMenu = ({ 
  x, 
  y, 
  onClose, 
  children,
  className = "" 
}) => {
  const menuRef = useRef(null);

  // Boundary protection: Ensure the menu stays within the viewport
  const menuWidth = 180;
  const menuHeight = 220;
  
  let adjustedX = x;
  let adjustedY = y;

  // Since we use translate(-50%, -10%), the center is at X
  if (x < menuWidth / 2 + 10) {
    adjustedX = menuWidth / 2 + 10;
  } else if (x > window.innerWidth - menuWidth / 2 - 10) {
    adjustedX = window.innerWidth - menuWidth / 2 - 10;
  }
  
  if (y > window.innerHeight - menuHeight - 10) {
    adjustedY = window.innerHeight - menuHeight - 10;
  } else if (y < 10) {
    adjustedY = 10;
  }

  useEffect(() => {
    const handleCloseEvents = (e) => {
      // Close on any click or touch outside
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };

    const handleScroll = () => {
      onClose();
    };

    // Use capturing phase to ensure we catch events before they propagate
    document.addEventListener("mousedown", handleCloseEvents, true);
    document.addEventListener("touchstart", handleCloseEvents, true);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      document.removeEventListener("mousedown", handleCloseEvents, true);
      document.removeEventListener("touchstart", handleCloseEvents, true);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        top: adjustedY,
        left: adjustedX,
        zIndex: 99999,
        transform: "translate(-50%, -10%)"
      }}
      className={`min-w-[180px] animate-in fade-in zoom-in-95 duration-[120ms] rounded-xl border border-[rgba(0,0,0,0.08)] bg-white text-[#111111] shadow-[0_8px_20px_rgba(0,0,0,0.08)] transition-all overflow-hidden dark:border-[rgba(255,255,255,0.06)] dark:bg-[#0f172a] dark:text-white ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="space-y-0.5">
        {children}
      </div>
    </div>,
    document.body
  );
};

export default DropdownMenu;
