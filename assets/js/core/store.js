(function (g) {
  const CCE = g.CCE = g.CCE || {};
  const NS = 'cce.v1';
  let ls = null;
  try { ls = g.localStorage; const k='__t'; ls.setItem(k,'1'); ls.removeItem(k); }
  catch (e) { ls = null; }
  let data = {};
  try { data = ls ? (JSON.parse(ls.getItem(NS)) || {}) : {}; } catch (e) { data = {}; }
  function persist() { if (ls) { try { ls.setItem(NS, JSON.stringify(data)); } catch (e) {} } }
  const store = {
    available: !!ls,
    get(key, dflt) { return key in data ? data[key] : dflt; },
    set(key, value) { data[key] = value; persist(); },
    isFavorite(id) { return (data.favorites || []).indexOf(id) !== -1; },
    toggleFavorite(id) {
      const f = data.favorites || (data.favorites = []);
      const i = f.indexOf(id); if (i === -1) f.push(id); else f.splice(i, 1);
      persist();
    },
    exportPrefs() { return JSON.stringify(data, null, 2); },
    importPrefs(json) {
      try { const o = JSON.parse(json); if (o && typeof o === 'object') { data = o; persist(); return true; } }
      catch (e) {} return false;
    }
  };
  CCE.store = store;
})(typeof globalThis !== 'undefined' ? globalThis : this);
