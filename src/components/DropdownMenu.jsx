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
  className = "",
  anchorHeight = 0
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

  if (y > window.innerHeight - menuHeight - 20) {
    // Not enough space below, flip above the button
    // y is currently rect.bottom + 5. We want it to be rect.top - menuHeight - 5
    // Since anchorHeight is rect.height, rect.top = y - 5 - anchorHeight
    adjustedY = y - menuHeight - (anchorHeight > 0 ? anchorHeight + 10 : 0);
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
        transform: "translate(-50%, 0)"
      }}
      className={`min-w-[180px] rounded-xl border border-[rgba(0,0,0,0.08)] bg-white text-[#111111] shadow-[0_8px_20px_rgba(0,0,0,0.08)] overflow-hidden transition-none dark:border-[rgba(255,255,255,0.06)] dark:bg-[#0f172a] dark:text-white ${className}`}
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
