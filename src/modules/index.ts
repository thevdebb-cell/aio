/**
 * Import every module that registers interaction handlers or panels,
 * purely for their side-effects (onButton/onSelect/onModal registration).
 */
import "./tickets/handlers.js";
import "./support/panel.js";
import "./orders/panel.js";
import "./orders/submit.js";
// welcome + antinuke are driven by gateway events (see src/events), not customIds.
