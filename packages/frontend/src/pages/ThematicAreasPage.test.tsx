import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '../i18n';
import { renderAtEvent } from '../test/render';
import { ThematicAreasPage } from './ThematicAreasPage';

describe('ThematicAreasPage (fixtures)', () => {
  it('2025 lists the 11 real areas from the I SIEAmB, in order (#37)', async () => {
    renderAtEvent('/2025/areas-tematicas', <ThematicAreasPage />);
    expect(await screen.findByRole('heading', { name: 'Governança e Políticas Públicas' })).toBeInTheDocument();
    const names = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(names).toHaveLength(11);
    expect(names.at(-1)).toBe('Saúde e Meio Ambiente');
    expect(screen.queryByText('Gestão de Recursos Hídricos')).toBeNull();
  });
});
