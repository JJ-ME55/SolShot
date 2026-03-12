import { useState, useEffect } from 'react';

/** Returns true when viewport is phone-sized (height < 500px = landscape phone, or width < 600px = portrait phone). */
export default function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerHeight < 500 || window.innerWidth < 600);
  useEffect(() => {
    const check = () => setMobile(window.innerHeight < 500 || window.innerWidth < 600);
    // Some mobile browsers (Safari) don't fire resize on orientation change,
    // or fire it before dimensions update. Delayed check catches both.
    const delayedCheck = () => setTimeout(check, 150);
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', delayedCheck);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', delayedCheck);
    };
  }, []);
  return mobile;
}
