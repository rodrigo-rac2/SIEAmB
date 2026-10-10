import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { EventProvider } from '../contexts/EventContext';

/**
 * Mounts an element under /:eventSlug with the real EventProvider and the
 * StaticDataProvider fixtures, the same wiring the app uses.
 */
export function renderAtEvent(path: string, element: ReactElement) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/:eventSlug/*"
          element={<EventProvider>{element}</EventProvider>}
        />
      </Routes>
    </MemoryRouter>,
  );
}
