import '@testing-library/jest-dom/vitest';

// Provide scrollTo stub for jsdom navigation effects
Object.defineProperty(window, 'scrollTo', {
  value: () => {},
  writable: true,
});
