/* Structural invalidation shared by progressive DOM enhancements. */

export function mutationsTouchSelector(mutations = [], selector = "") {
  if (!selector) return false;

  return mutations.some((mutation) => {
    if (mutation.type !== "childList") return false;

    return [...mutation.addedNodes, ...mutation.removedNodes].some((node) => (
      node.nodeType === 1 &&
      (node.matches(selector) || node.querySelector(selector))
    ));
  });
}
