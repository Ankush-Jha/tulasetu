import { Outlet } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-canvas">
      <Header />
      <Sidebar />
      <div className="pl-24 pr-[--spacing-md]">
        <main className="w-full pt-20 pb-[--spacing-2xl] min-h-screen">
          <div className="card-stage p-[--spacing-card] min-h-[calc(100vh-6.5rem)]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
