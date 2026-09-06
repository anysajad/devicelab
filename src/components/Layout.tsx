import type { ReactNode } from 'react';

import { ProjectBar } from '../projects/components/ProjectBar';
import { ThemeControl } from './ThemeControl';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
          <span className="text-lg font-semibold text-brand-600 dark:text-brand-400">
            DeviceLab
          </span>
          <div className="flex-1" />
          <ThemeControl />
          <ProjectBar />
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
