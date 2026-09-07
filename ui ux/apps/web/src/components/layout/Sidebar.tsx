import { NavLink } from 'react-router-dom';
import { sidebarLinks } from '../../data/mockData';

export default function Sidebar() {
  return (
    <aside className="fixed left-[--spacing-md] top-24 bottom-[--spacing-md] w-16 bg-surface-lowest rounded-3xl shadow-[var(--shadow-card)] z-40 flex flex-col items-center py-[--spacing-lg] justify-between">
      <div className="flex flex-col items-center gap-[--spacing-sm]">
        {sidebarLinks.map((link) => (
          <NavLink
            key={link.path}
            to={link.path}
            title={link.label}
            className={({ isActive }) =>
              `w-11 h-11 rounded-2xl flex items-center justify-center transition-all ${
                isActive
                  ? 'bg-surface-low text-on-surface'
                  : 'text-on-surface-variant hover:bg-surface-low hover:text-on-surface'
              }`
            }
          >
            <span className="material-symbols-outlined text-[20px]">{link.icon}</span>
          </NavLink>
        ))}
      </div>
      <div className="flex flex-col items-center gap-[--spacing-xs]">
        <a
          href="#"
          title="System Settings"
          className="w-11 h-11 rounded-2xl flex items-center justify-center text-on-surface-variant hover:bg-surface-low hover:text-on-surface transition-all"
        >
          <span className="material-symbols-outlined text-[20px]">settings</span>
        </a>
      </div>
    </aside>
  );
}
