export function addEmptyTypeRelations(dataset: unknown): unknown {
  if (!Array.isArray(dataset)) return dataset;
  return dataset.map((record) => {
    if (typeof record !== 'object' || record === null || !('types' in record) || !Array.isArray(record.types)) return record;
    if ('typeDetails' in record) return record;
    const typeDetails = record.types.map((name: unknown) => ({
      name,
      url: `https://pokeapi.co/api/v2/type/${String(name)}/`,
      damageRelations: {
        noDamageTo: [], halfDamageTo: [], doubleDamageTo: [],
        noDamageFrom: [], halfDamageFrom: [], doubleDamageFrom: [],
      },
      pastDamageRelations: [],
    }));
    return { ...record, typeDetails };
  });
}
