import { useState, useCallback, useEffect } from 'react';

const LS_KEY = 'solshot_control_scheme';

export default function useControlScheme(isMobile) {
  const [scheme, setScheme] = useState(() => {
    const stored = localStorage.getItem(LS_KEY);
    return stored || 'classic';
  });

  const updateScheme = useCallback((v) => {
    localStorage.setItem(LS_KEY, v);
    window.controlScheme = v;
    setScheme(v);
  }, []);

  // Keep window.controlScheme in sync on mount and whenever scheme changes
  useEffect(() => {
    window.controlScheme = scheme;
  }, [scheme]);

  return [scheme, updateScheme];
}
