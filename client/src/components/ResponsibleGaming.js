import React from 'react';

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
  helplineRow: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 10,
    color: 'var(--kh, #6b7280)',
    opacity: 0.5,
    letterSpacing: 1,
    marginBottom: 3,
  },
  legalRow: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 10,
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
  },
  separator: {
    opacity: 0.4,
    marginLeft: 4,
    marginRight: 4,
  },
  badge: {
    fontWeight: 'bold',
    marginRight: 6,
  },
};

const ToS_URL = 'https://github.com/JJ-ME55/SolShot/blob/main/Docs/SOLSHOT_TERMS_OF_SERVICE.md';
const PP_URL = 'https://github.com/JJ-ME55/SolShot/blob/main/Docs/SOLSHOT_PRIVACY_POLICY.md';

function ResponsibleGaming() {
  return (
    <div style={styles.container}>
      <div style={styles.helplineRow}>
        <span style={styles.badge}>18+</span>
        PLAY RESPONSIBLY
        <a
          href="https://www.begambleaware.org"
          target="_blank"
          rel="noopener noreferrer"
          style={styles.link}
        >
          BeGambleAware
        </a>
        <span style={styles.separator}>|</span>
        <a
          href="https://www.ncpgambling.org"
          target="_blank"
          rel="noopener noreferrer"
          style={styles.link}
        >
          NCPG
        </a>
        <span style={styles.separator}>|</span>
        <a
          href="https://www.gamcare.org.uk"
          target="_blank"
          rel="noopener noreferrer"
          style={styles.link}
        >
          GamCare
        </a>
      </div>
      <div style={styles.legalRow}>
        <a
          href={ToS_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={styles.link}
        >
          Terms of Service
        </a>
        <span style={styles.separator}>|</span>
        <a
          href={PP_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={styles.link}
        >
          Privacy Policy
        </a>
      </div>
    </div>
  );
}

export default ResponsibleGaming;
