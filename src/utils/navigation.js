/**
 * Adds visual feedback (opacity + scale) when user clicks a navigation element
 * @param {Event} e - The click event
 * @param {Function} navigateCallback - The navigation function to call
 */
export function handleNavigationClick(e, navigateCallback) {
  // Add visual feedback
  const element = e.currentTarget
  element.classList.add('nav-button-pressed')
  
  // Call the navigation function
  navigateCallback()
  
  // Remove feedback class after animation completes
  setTimeout(() => {
    element.classList.remove('nav-button-pressed')
  }, 150)
}
