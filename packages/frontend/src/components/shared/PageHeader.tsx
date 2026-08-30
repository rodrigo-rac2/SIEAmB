import type { ReactNode } from 'react';
import './PageHeader.css';

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="page-header">
      <div className="container">
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  );
}
