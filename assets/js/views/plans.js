(function (g) {
  'use strict';
  var CCE = g.CCE = g.CCE || {};

  CCE.router = CCE.router || {};
  if (typeof CCE.router.register !== 'function') return;

  CCE.router.register('#/plans', {
    title: 'Plans',
    mount: function (root) {
      /* Set toolbar */
      var tb = document.querySelector('.toolbar');
      if (tb) tb.innerHTML = '<span class="doc-title">Plans</span><div class="spacer"></div>';

      /* Set base layout */
      root.innerHTML = '<div class="doc-view"><aside class="doc-list" id="doc-list"></aside><div class="doc-body" id="doc-body"></div></div>';

      var docList = root.querySelector('#doc-list');
      var docBody = root.querySelector('#doc-body');

      CCE.fsaccess.listPlans().then(function (plans) {
        if (!plans || plans.length === 0) {
          docBody.innerHTML = '<div class="doc-empty"><h3>No plans</h3><p>Files in ~/.claude/plans will appear here.</p></div>';
          return;
        }

        /* Build sidebar list */
        var listHTML = '';
        plans.forEach(function (plan, idx) {
          var cls = idx === 0 ? 'doc-item active' : 'doc-item';
          listHTML += '<div class="' + cls + '" data-idx="' + idx + '" data-open-key="' +
            CCE.markdown.esc(plan.name) + '">' + CCE.markdown.esc(plan.name) + '</div>';
        });
        docList.innerHTML = listHTML;

        /* Click handler */
        function loadPlan(plan, clickedEl) {
          /* Move active class */
          var items = docList.querySelectorAll('.doc-item');
          items.forEach(function (el) { el.classList.remove('active'); });
          clickedEl.classList.add('active');

          docBody.innerHTML = 'Loading…';

          plan.read().then(function (text) {
            docBody.innerHTML = '<div class="vwr-md-content">' + CCE.markdown.render(text) + '</div>';
          }).catch(function (err) {
            docBody.innerHTML = '<div class="doc-empty"><p>Error loading plan: ' + CCE.markdown.esc(String(err && err.message ? err.message : err)) + '</p></div>';
          });
        }

        /* Wire up click events */
        var items = docList.querySelectorAll('.doc-item');
        items.forEach(function (el) {
          el.addEventListener('click', function () {
            var idx = parseInt(el.getAttribute('data-idx'), 10);
            loadPlan(plans[idx], el);
          });
        });

        /* Auto-load first plan, unless a deep link (?open=<name>) asks for another */
        var openKey = (location.hash.split('?')[1] || '');
        openKey = new URLSearchParams(openKey).get('open');
        var target = openKey
          ? docList.querySelector('[data-open-key="' + CSS.escape(openKey) + '"]')
          : null;

        if (target) {
          var idx = parseInt(target.getAttribute('data-idx'), 10);
          loadPlan(plans[idx], target);
          target.scrollIntoView({ block: 'nearest' });
        } else if (items.length > 0) {
          loadPlan(plans[0], items[0]);
        }
      }).catch(function (err) {
        docBody.innerHTML = '<div class="doc-empty"><p>Error listing plans: ' + CCE.markdown.esc(String(err && err.message ? err.message : err)) + '</p></div>';
      });
    }
  });

})(typeof globalThis !== 'undefined' ? globalThis : this);
