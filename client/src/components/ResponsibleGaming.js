import React from 'react';
import useIsMobile from '../hooks/useIsMobile';

const styles = {
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: '6px 12px 8px',
    textAlign: 'center',
    zIndex: 2,
  },
  legalRow: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    color: 'var(--kh, #6b7280)',
    opacity: 0.4,
    letterSpacing: 1,
  },
  link: {
    color: 'inherit',
    textDecoration: 'none',
    borderBottom: '1px solid rgba(107, 114, 128, 0.3)',
    marginLeft: 4,
    marginRight: 4,
    cursor: 'pointer',
  },
  separator: {
    opacity: 0.4,
    marginLeft: 4,
    marginRight: 4,
  },
};

function ResponsibleGaming({ navigate }) {
  const isMobile = useIsMobile();
  const containerStyle = isMobile
    ? { ...styles.container, position: 'relative', marginTop: 'auto' }
    : styles.container;

  return (
    <div style={containerStyle}>
      <div style={styles.legalRow}>
        18+
        <span style={styles.separator}>|</span>
        <span
          style={styles.link}
          onClick={() => navigate && navigate('terms')}
        >
          Terms of Service
        </span>
        <span style={styles.separator}>|</span>
        <span
          style={styles.link}
          onClick={() => navigate && navigate('privacy')}
        >
          Privacy Policy
        </span>
      </div>
    </div>
  );
}

export default ResponsibleGaming;
