/**
 * Static-export visibility runtime.
 *
 * Kept out of document.ts so it can be unit-tested: that module pulls in
 * page-fetcher, which is server-only.
 */

/**
 * Visibility re-evaluation runtime for the static export. Reads
 * `data-ycode-vis-rule` data attributes (emitted by `layerToHtml` when
 * a layer's conditionalVisibility references a date preset like `$today`)
 * and re-evaluates the rule on page load, so layers gated on
 * time-relative dates flip across day boundaries without a re-export.
 *
 * The static export bakes the export-time evaluation into the page's
 * inline `display` style; this script only flips it when the *current*
 * evaluation diverges (i.e. enough days have passed since the export).
 */
export const VISIBILITY_BOOT_SCRIPT = `
(function () {
  if (typeof document === 'undefined') return;

  function fmt(y, m0, d) { return new Date(Date.UTC(y, m0, d)).toISOString().slice(0, 10); }

  // Calendar Y/M/D (1-based month) of an instant as seen in a timezone.
  function tzParts(date, tz) {
    try {
      var parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(date);
      function get(t) { for (var i = 0; i < parts.length; i++) if (parts[i].type === t) return Number(parts[i].value); return 0; }
      return { year: get('year'), month: get('month'), day: get('day') };
    } catch (_) {
      return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
    }
  }

  // UTC epoch ms for a wall-clock time interpreted in the given timezone.
  function zonedToUtc(y, m, d, h, mi, s, ms, tz) {
    var guess = Date.UTC(y, m - 1, d, h, mi, s, ms);
    try {
      var parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      }).formatToParts(new Date(guess));
      function get(t) { for (var i = 0; i < parts.length; i++) if (parts[i].type === t) return Number(parts[i].value); return 0; }
      var wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
      return guess - (wall - guess);
    } catch (_) { return guess; }
  }

  // Mirror of resolveDatePreset: resolve a preset to YYYY-MM-DD bounds relative
  // to the current date in the project timezone.
  function resolvePreset(preset, tz) {
    var p = tzParts(new Date(), tz);
    var y = p.year, m = p.month - 1, d = p.day;
    switch (preset) {
      case '$today':
        return { start: fmt(y, m, d), end: fmt(y, m, d) };
      case '$this_week': {
        var dow = new Date(Date.UTC(y, m, d)).getUTCDay();
        var off = (dow + 6) % 7;
        return { start: fmt(y, m, d - off), end: fmt(y, m, d - off + 6) };
      }
      case '$this_month':
        return { start: fmt(y, m, 1), end: fmt(y, m + 1, 0) };
      case '$this_year':
        return { start: fmt(y, 0, 1), end: fmt(y, 11, 31) };
      case '$past_week':
        return { start: fmt(y, m, d - 7), end: fmt(y, m, d) };
      case '$past_month':
        return { start: fmt(y, m - 1, d), end: fmt(y, m, d) };
      case '$past_year':
        return { start: fmt(y - 1, m, d), end: fmt(y, m, d) };
      default:
        return null;
    }
  }

  // Mirror of dateStringToDayBounds: YYYY-MM-DD spans a full day in the project
  // timezone (UTC for date_only fields); any other value collapses to an instant.
  function dayBounds(value, tz, dateOnly) {
    if (!value) return null;
    if (/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) {
      if (dateOnly) {
        var s = Date.parse(value + 'T00:00:00.000Z');
        var e = Date.parse(value + 'T23:59:59.999Z');
        if (isNaN(s) || isNaN(e)) return null;
        return { start: s, end: e };
      }
      var parts = value.split('-');
      var y = Number(parts[0]), mo = Number(parts[1]), da = Number(parts[2]);
      return { start: zonedToUtc(y, mo, da, 0, 0, 0, 0, tz), end: zonedToUtc(y, mo, da, 23, 59, 59, 999, tz) };
    }
    var ts = Date.parse(value);
    return isNaN(ts) ? null : { start: ts, end: ts };
  }

  // Mirror of resolveDateFilterValue.
  function resolveCompareValue(operator, value, tz) {
    if (typeof value !== 'string' || value.charAt(0) !== '$') {
      return { operator: operator, value: value, value2: undefined };
    }
    var range = resolvePreset(value, tz);
    if (!range) return { operator: operator, value: value, value2: undefined };
    switch (operator) {
      case 'is':
      case 'is_between':
        return { operator: 'is_between', value: range.start, value2: range.end };
      case 'is_before':
        return { operator: 'is_before', value: range.start };
      case 'is_after':
        return { operator: 'is_after', value: range.end };
      default:
        return { operator: 'is_between', value: range.start, value2: range.end };
    }
  }

  // Mirror of compareDateFilter.
  function compareDate(storedValue, operator, filterValue, filterValue2, tz, dateOnly) {
    var valueTs = Date.parse(storedValue);
    if (isNaN(valueTs)) return false;
    var bounds = dayBounds(filterValue, tz, dateOnly);
    if (!bounds) return false;
    switch (operator) {
      case 'is': return valueTs >= bounds.start && valueTs <= bounds.end;
      case 'is_before': return valueTs < bounds.start;
      case 'is_after': return valueTs > bounds.end;
      case 'is_between':
        var bounds2 = dayBounds(filterValue2, tz, dateOnly);
        if (!bounds2) return false;
        return valueTs >= bounds.start && valueTs <= bounds2.end;
      default: return false;
    }
  }

  function evaluateDynamicCondition(condition, tz) {
    var resolved = resolveCompareValue(condition.operator, condition.value, tz);
    return compareDate(condition.fieldValue || '', resolved.operator, resolved.value, resolved.value2, tz, !!condition.dateOnly);
  }

  // Mirror of evaluateVisibility (lib/layer-utils): conditions OR within a
  // group, groups are show/hide rules, defaultVisibility is the "Else".
  // Precedence: a matching HIDE wins; else a matching SHOW reveals; else the
  // default. Non-date conditions carry a baked export-time result; date-preset
  // conditions re-evaluate against the current date.
  function evaluateRule(payload) {
    var tz = (payload && payload.timezone) || 'UTC';
    var groups = (payload && payload.groups) || [];
    var defaultVisible = (payload && payload.defaultVisibility) !== 'hidden';
    if (groups.length === 0) return defaultVisible;

    var showMatched = false;
    var hideMatched = false;

    for (var i = 0; i < groups.length; i++) {
      var conditions = groups[i].conditions || [];
      if (conditions.length === 0) continue;
      var groupResult = false;
      for (var j = 0; j < conditions.length; j++) {
        var c = conditions[j];
        var ok = c.dynamic ? evaluateDynamicCondition(c, tz) : !!c.result;
        if (ok) { groupResult = true; break; }
      }
      if (!groupResult) continue;
      if ((groups[i].action || 'show') === 'hide') hideMatched = true;
      else showMatched = true;
    }

    if (hideMatched) return false;
    if (showMatched) return true;
    return defaultVisible;
  }

  function evaluateAll() {
    var nodes = document.querySelectorAll('[data-ycode-vis-rule]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      try {
        var payload = JSON.parse(el.getAttribute('data-ycode-vis-rule'));
        if (evaluateRule(payload)) el.style.removeProperty('display');
        else el.style.display = 'none';
      } catch (_) { /* malformed payload — leave as-is */ }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', evaluateAll);
  } else {
    evaluateAll();
  }
})();
`.trim()
