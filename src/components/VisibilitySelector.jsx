import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { VISIBILITY_MODES, VISIBILITY_CONFIG } from '../lib/postVisibility'

/**
 * Premium visibility selector component
 * Displays as a pill dropdown with icons and labels
 */
export default function VisibilitySelector({ 
  value = 'public', 
  onChange,
  disabled = false
}) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)

  const config = VISIBILITY_CONFIG[value]

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const options = [
    { value: VISIBILITY_MODES.PUBLIC },
    { value: VISIBILITY_MODES.PRIVATE }
  ]

  const handleSelect = (newValue) => {
    onChange(newValue)
    setIsOpen(false)
  }

  return (
    <div ref={dropdownRef} className="relative w-fit pointer-events-auto">
      {/* Selector Pill Button */}
      <motion.button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        whileHover={{ scale: disabled ? 1 : 1.02 }}
        whileTap={{ scale: disabled ? 1 : 0.98 }}
        className={`
          inline-flex items-center gap-2 px-4 py-2 rounded-full font-medium
          border transition-all duration-200
          ${disabled 
            ? 'opacity-50 cursor-not-allowed bg-gray-100 border-gray-200 text-gray-600'
            : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400 cursor-pointer'
          }
        `}
      >
        <span className="text-lg">{config.icon}</span>
        <span>{config.label}</span>
        <motion.svg
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="w-4 h-4 ml-1"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </motion.svg>
      </motion.button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute top-full left-0 mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-2xl z-[9999] overflow-visible"
          >
            <div className="py-1">
              {options.map((option) => {
                const optionConfig = VISIBILITY_CONFIG[option.value]
                const isSelected = value === option.value

                return (
                  <motion.button
                    key={option.value}
                    onClick={() => handleSelect(option.value)}
                    whileHover={{ backgroundColor: 'rgba(59, 130, 246, 0.05)' }}
                    className={`
                      w-full px-4 py-3 text-left transition-all duration-200 flex items-start gap-3
                      ${isSelected 
                        ? 'bg-blue-50 border-l-2 border-l-blue-500' 
                        : 'border-l-2 border-l-transparent hover:bg-gray-50'
                      }
                    `}
                  >
                    <span className="text-xl mt-0.5">{optionConfig.icon}</span>
                    <div className="flex-1">
                      <div className={`font-semibold text-sm ${
                        isSelected ? 'text-blue-700' : 'text-gray-900'
                      }`}>
                        {optionConfig.label}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {optionConfig.description}
                      </div>
                    </div>
                    {isSelected && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center mt-0.5"
                      >
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </motion.div>
                    )}
                  </motion.button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
