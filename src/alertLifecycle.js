export function emptyAlertState() {
  return { reviewed: {}, hidden: {} };
}

export function normalizeAlertState(value = {}) {
  return {
    reviewed: isPlainObject(value.reviewed) ? value.reviewed : {},
    hidden: isPlainObject(value.hidden) ? value.hidden : {}
  };
}

export function applyAlertState(alerts = [], alertState = emptyAlertState()) {
  const state = normalizeAlertState(alertState);
  const hiddenIds = new Set(Object.keys(state.hidden));
  const reviewedIds = new Set(Object.keys(state.reviewed));
  const visibleAlerts = alerts
    .filter((alert) => !hiddenIds.has(alert.id))
    .map((alert) => ({
      ...alert,
      status: reviewedIds.has(alert.id) ? "reviewed" : "active",
      reviewedAt: state.reviewed[alert.id] || null
    }));

  return {
    visibleAlerts,
    summary: {
      total: alerts.length,
      visible: visibleAlerts.length,
      reviewed: alerts.filter((alert) => reviewedIds.has(alert.id)).length,
      hidden: alerts.filter((alert) => hiddenIds.has(alert.id)).length
    }
  };
}

export function filterVisibleAlphaSignals(signals = [], alertState = emptyAlertState()) {
  const state = normalizeAlertState(alertState);
  return signals.filter((signal) => {
    const alertId = `alpha:${signal.id}`;
    return !state.hidden[alertId] && !state.reviewed[alertId];
  });
}

export function markAlertReviewed(alertState, alertId, timestamp = new Date().toISOString()) {
  const state = normalizeAlertState(alertState);
  if (!alertId) return state;
  return {
    reviewed: { ...state.reviewed, [alertId]: timestamp },
    hidden: { ...state.hidden }
  };
}

export function hideAlert(alertState, alertId, timestamp = new Date().toISOString()) {
  const state = normalizeAlertState(alertState);
  if (!alertId) return state;
  return {
    reviewed: { ...state.reviewed },
    hidden: { ...state.hidden, [alertId]: timestamp }
  };
}

export function restoreHiddenAlerts(alertState) {
  const state = normalizeAlertState(alertState);
  return {
    reviewed: { ...state.reviewed },
    hidden: {}
  };
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}
