import { type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const;

export async function analyzeAxe(page: Page, include?: string) {
  let builder = new AxeBuilder({ page }).withTags([...AXE_TAGS]);
  if (include) builder = builder.include(include);
  return builder.analyze();
}
