/** Square CardClassSelectors — only properties the Web Payments SDK accepts (see Square docs). */
export function squareCardStyle(dark: boolean): Record<string, Record<string, string>> {
  if (dark) {
    return {
      '.input-container': {
        borderColor: '#404040',
        borderRadius: '10px',
        borderWidth: '1px',
      },
      '.input-container.is-focus': {
        borderColor: '#dc2626',
      },
      '.input-container.is-error': {
        borderColor: '#f04438',
      },
      '.message-text': {
        color: '#a3a3a3',
      },
      '.message-icon': {
        color: '#a3a3a3',
      },
      '.message-text.is-error': {
        color: '#fca5a5',
      },
      '.message-icon.is-error': {
        color: '#fca5a5',
      },
      input: {
        backgroundColor: '#171717',
        color: '#f5f5f5',
        fontSize: '16px',
      },
      'input::placeholder': {
        color: '#a3a3a3',
      },
      'input.is-error': {
        color: '#fca5a5',
      },
    }
  }

  return {
    '.input-container': {
      borderColor: '#e5e7eb',
      borderRadius: '10px',
      borderWidth: '1px',
    },
    '.input-container.is-focus': {
      borderColor: '#0a1627',
    },
    '.input-container.is-error': {
      borderColor: '#f04438',
    },
    '.message-text': {
      color: '#6b7280',
    },
    '.message-icon': {
      color: '#6b7280',
    },
    input: {
      backgroundColor: '#ffffff',
      color: '#0a0a0b',
      fontSize: '16px',
    },
    'input::placeholder': {
      color: '#6b7280',
    },
  }
}
