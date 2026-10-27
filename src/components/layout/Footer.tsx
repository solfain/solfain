import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <div>
          <strong style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>SOLFAIN</strong>
          <span> · Anime metadata provided by </span>
          <a
            href="https://anilist.co"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--text-secondary)', textDecoration: 'underline' }}
          >
            AniList
          </a>
          <span>.</span>
        </div>

        <nav className="site-footer__links" aria-label="Footer navigation">
          <Link to="/">Home</Link>
          <Link to="/search">Browse</Link>
          <Link to="/seasons">Seasons</Link>
          <Link to="/schedule">Schedule</Link>
          <Link to="/favorites">Watchlist</Link>
          <Link to="/history">Watch History</Link>
        </nav>
      </div>
    </footer>
  );
}
