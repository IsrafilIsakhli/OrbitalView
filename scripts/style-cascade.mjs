// Build-time cleanup of retired UI and exact-selector overrides. No selector renaming.
const retired = new Set([
  "mission-manifest", "launch-mission-card", "nasa-provider-state", "launch-weather-card",
  "module-stage", "orbital-legend", "earth-performance", "nasa-source-matrix",
  "mission-provider-state", "mission-queue-context", "mission-lifecycle-badge", "mission-event-card",
  "nasa-provider-badge", "mission-telemetry-grid", "data-freshness", "mission-count",
  "mission-events", "navigation-item__soon", "command-action__indicator", "mission-location",
  "mission-layout", "status-chip__dot", "status-row", "launch-weather-stale", "control-card-actions",
  "mission-empty", "mission-page-header", "launch-open-detail", "freshness-stamp", "provider-mini-grid",
  "launch-timeline__retry",
]);
function isRetired(selector) {
  return [...selector.matchAll(/\.([a-zA-Z_][\w-]*)/g)].some(([, name]) => retired.has(name) || retired.has(name.split("__")[0]) || retired.has(name.split("--")[0]));
}

export default function styleCascade() {
  return {
    postcssPlugin: "orbital-cascade-cleanup",
    Once(root) {
      root.walkRules((rule) => {
        const selectors = rule.selectors.filter((selector) => !isRetired(selector));
        if (!selectors.length) rule.remove();
        else if (selectors.length > 1) {
          for (const selector of selectors) rule.cloneBefore({ selector });
          rule.remove();
        } else rule.selectors = selectors;
      });
      const rules = [];
      root.walkRules((rule) => rules.push(rule));
      const later = new Map();
      for (const rule of rules.reverse()) {
        // Keep keyframe declarations and nested selectors intact.
        const parents = []; let parent = rule.parent; let unsupported = false;
        while (parent && parent.type !== "root") {
          if (parent.type !== "atrule" || !["media", "supports"].includes(parent.name)) unsupported = true;
          parents.unshift(`${parent.name}:${parent.params}`); parent = parent.parent;
        }
        if (unsupported) continue;
        const prefix = `${parents.join("/")}|${rule.selector}|`;
        for (const declaration of [...rule.nodes].reverse()) {
          if (declaration.type !== "decl") continue;
          const key = prefix + declaration.prop;
          const scoped = later.get(key);
          const universal = later.get(`|${rule.selector}|${declaration.prop}`);
          const next = scoped?.important ? scoped : universal?.important ? universal : scoped ?? universal;
          if (next && (next.important || !declaration.important)) {
            declaration.remove();
          } else later.set(key, { important: declaration.important });
        }
        if (!rule.nodes.length) rule.remove();
      }
      root.walkAtRules((rule) => { if (rule.nodes && !rule.nodes.length) rule.remove(); });
    },
  };
}
