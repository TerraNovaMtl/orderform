/** Reorder the visible slots only, preserving every filtered-out product's position. */
export function reorderVisibleProducts(
  all: string[],
  visible: string[],
  source: string,
  target: string,
) {
  const from = visible.indexOf(source),
    to = visible.indexOf(target);
  if (from < 0 || to < 0 || from === to) return all;
  const reordered = [...visible];
  reordered.splice(from, 1);
  reordered.splice(to, 0, source);
  const visibleSet = new Set(visible);
  let index = 0;
  return all.map((id) => (visibleSet.has(id) ? reordered[index++] : id));
}
