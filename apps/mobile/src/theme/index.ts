import { palettes } from './tokens';
import type { Palette, ThemeName } from './tokens';

export * from './tokens';

export function useThemeName(): ThemeName {
  return 'light';
}

export function usePalette(): Palette {
  return palettes.light;
}

export function useIsDark(): boolean {
  return false;
}
