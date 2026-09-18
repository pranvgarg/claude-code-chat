(function (g) {
  'use strict';
  const CCE = g.CCE = g.CCE || {};

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) { return '$' + (Number(n) || 0).toFixed(2); }
  function fmtTokens(n) {
    n = Number(n) || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
    return String(n);
  }
  function relTime(ts, now) {
    if (!ts) return '';
    var ms = (now == null ? Date.now() : now) - new Date(ts).getTime();
    if (!(ms >= 0)) ms = 0;
    var mins = Math.floor(ms / 60000), hrs = Math.floor(ms / 3600000), days = Math.floor(ms / 86400000);
    if (mins < 60) return mins + 'm';
    if (hrs < 24) return hrs + 'h';
    if (days < 7) return days + 'd';
    if (days < 14) return '1w';
    return Math.round(days / 7) + 'w';
  }
  function modelClass(model) {
    var m = String(model || '').toLowerCase();
    if (m.indexOf('opus') !== -1) return 'opus';
    if (m.indexOf('haiku') !== -1) return 'haiku';
    if (m.indexOf('fable') !== -1 || m.indexOf('mythos') !== -1) return 'fable';
    return 'sonnet';
  }
  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }
  function fmtTime(ts) {
    if (!ts) return '';
    try {
      return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) { return String(ts); }
  }

  CCE.util = { esc: esc, money: money, fmtTokens: fmtTokens, relTime: relTime, modelClass: modelClass, debounce: debounce, fmtTime: fmtTime };
})(typeof globalThis !== 'undefined' ? globalThis : this);
