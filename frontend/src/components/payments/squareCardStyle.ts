/**
 * Square CardClassSelectors — only properties the Web Payments SDK accepts.
 * Always dark text on a white field. Dark-mode `color: #fff` is unreadable
 * when Square (or the browser) keeps a light iframe background, and we cannot
 * collect PANs ourselves without entering PCI scope.
 */
export function squareCardStyle(dark: boolean): Record<string, Record<string, string>> {
  return {
    '.input-container': {
      borderColor: dark ? '#d4d4d4' : '#e5e7eb',
      borderRadius: '10px',
      borderWidth: '1px',
    },
    '.input-container.is-focus': {
      borderColor: dark ? '#dc2626' : '#0a1627',
    },
    '.input-container.is-error': {
      borderColor: '#f04438',
    },
    '.message-text': {
      color: '#525252',
    },
    '.message-icon': {
      color: '#525252',
    },
    '.message-text.is-error': {
      color: '#b42318',
    },
    '.message-icon.is-error': {
      color: '#b42318',
    },
    input: {
      backgroundColor: '#ffffff',
      color: '#171717',
      fontSize: '16px',
    },
    'input::placeholder': {
      color: '#737373',
    },
    'input.is-error': {
      color: '#b42318',
    },
  }
}
