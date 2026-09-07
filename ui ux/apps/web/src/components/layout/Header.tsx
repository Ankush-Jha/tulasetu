import { NavLink, useLocation } from 'react-router-dom';
import { headerNavLinks } from '../../data/mockData';

export default function Header() {
  const location = useLocation();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-canvas/90 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
      <div className="h-20 w-full px-[--spacing-lg] flex items-center justify-between gap-[--spacing-md]">
        {/* Logo */}
        <div className="flex items-center gap-[--spacing-sm] shrink-0">
          <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center">
            <span className="material-symbols-outlined text-on-primary text-[20px]">balance</span>
          </div>
          <div className="flex flex-col">
            <span className="text-headline-sm font-bold tracking-tight leading-tight">TulaSetu</span>
            <div className="flex items-center gap-[--spacing-2xs]">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary-container"></span>
              <span className="text-label-sm text-on-surface-variant">RRSL GOV Legal Metrology</span>
            </div>
          </div>
        </div>

        {/* Navigation Pills */}
        <nav className="hidden xl:flex pill-nav">
          {headerNavLinks.map((link) => (
            <NavLink
              key={link.path}
              to={link.path}
              className={() => {
                const isActive = location.pathname === link.path ||
                  (link.path === '/new/profile' && location.pathname.startsWith('/new'));
                return `pill-nav-item ${isActive ? 'active' : ''}`;
              }}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        {/* Right side actions */}
        <div className="flex items-center gap-[--spacing-xs] shrink-0">
          {/* Notifications */}
          <div className="relative flex items-center justify-center w-9 h-9 rounded-full bg-surface-lowest shadow-[var(--shadow-pill)] text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer">
            <span className="material-symbols-outlined text-[20px]">notifications</span>
            <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-primary text-on-primary text-label-sm text-[10px] flex items-center justify-center font-bold">2</span>
          </div>
          {/* Chat */}
          <div className="flex items-center justify-center w-9 h-9 rounded-full bg-surface-lowest shadow-[var(--shadow-pill)] text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer">
            <span className="material-symbols-outlined text-[20px]">chat_bubble</span>
          </div>
          {/* User profile */}
          <div className="flex items-center gap-[--spacing-xs] bg-surface-lowest pl-[--spacing-xs] pr-[--spacing-md] py-1.5 rounded-full shadow-[var(--shadow-pill)]">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-on-primary text-[18px]">person</span>
            </div>
            <div className="hidden md:flex flex-col text-left">
              <span className="text-label-md font-semibold leading-tight">Priya Sharma</span>
              <span className="text-label-sm text-on-surface-variant leading-tight">Chief Metrologist, RRSL Faridabad</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
