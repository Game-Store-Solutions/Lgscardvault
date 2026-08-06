/** Square CardClassSelectors — aligned with app tokens in index.css (.dark). */
export function squareCardStyle(dark: boolean): Record<string, Record<string, string>> {
  if (dark) {
    return {
      '.input-container': {
        borderColor: '#2a2f3a',
        borderRadius: '10px',
        borderWidth: '1px',
      },
      '.input-container.is-focus': {
        borderColor: '#8b7dff',
      },
      '.input-container.is-error': {
        borderColor: '#f04438',
      },
      '.message-text': {
        color: '#9aa1b4',
      },
      '.message-icon': {
        color: '#9aa1b4',
      },
      '.message-text.is-error': {
        color: '#fca5a5',
      },
      '.message-icon.is-error': {
        color: '#fca5a5',
      },
      input: {
        backgroundColor: '#171a22',
        color: '#e7e9f0',
        fontSize: '16px',
      },
      'input::placeholder': {
        color: '#9aa1b4',
      },
      'input.is-error': {
        color: '#fca5a5',
      },
    }
  }

  return {
    '.input-container': {
      borderColor: '#e7e9ee',
      borderRadius: '10px',
      borderWidth: '1px',
    },
    '.input-container.is-focus': {
      borderColor: '#6d5efc',
    },
    '.input-container.is-error': {
      borderColor: '#f04438',
    },
    '.message-text': {
      color: '#64748b',
    },
    '.message-icon': {
      color: '#64748b',
    },
    input: {
      backgroundColor: '#ffffff',
      color: '#0f172a',
      fontSize: '16px',
    },
    'input::placeholder': {
      color: '#64748b',
    },
  }
}
