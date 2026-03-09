import { useState, useEffect } from 'react';

/** Returns true when viewport is phone-sized (height < 500px = landscape phone, or width < 600px = portrait phone). */
export default function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerHeight < 500 || window.innerWidth < 600);
  useEffect(() => {
    const check = () => setMobile(window.innerHeight < 500 || window.innerWidth < 600);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return mobile;
}
