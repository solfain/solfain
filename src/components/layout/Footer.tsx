import { Link } from 'react-router-dom';
import { SolfainLogo } from './Header';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link to="/" className="brand-logo" style={{ fontSize: '0.9375rem' }}>
            <SolfainLogo />
            <span>SOLFAIN</span>
          </Link>
          <span>Anime metadata provided by the AniList API.</span>
        </div>

        <nav className="site-footer__links" aria-label="Footer navigation">
          <Link to="/">Home</Link>
          <Link to="/search">Browse</Link>
          <Link to="/favorites">Favorites</Link>
          <Link to="/history">Watch History</Link>
          <a href="https://anilist.co" target="_blank" rel="noopener noreferrer">
            AniList
          </a>
        </nav>
      </div>
    </footer>
  );
}
