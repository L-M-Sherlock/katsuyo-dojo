// Display hierarchy only: never modify the model's ordering or scoring data.
/**
 * @template {{id: string, coverageKcIds: string[]}} T
 * @param {T[]} components
 * @param {T[]} catalog
 * @returns {{component: T, coverage: T[]}[]}
 */
export function groupKnowledgeCoverage(components, catalog = components) {
  const byId = new Map(catalog.map(component => [component.id, component]));
  const owned = new Set(components.flatMap(component => component.coverageKcIds));
  return components.filter(component => !owned.has(component.id)).map(component => ({
    component,
    coverage: [...new Set(component.coverageKcIds)].map(id => byId.get(id)).filter(Boolean),
  }));
}
