/* invite.js - la base no se carga hasta que el codigo de invitacion es valido. */
(function () {
  'use strict';
  var HOST = (window.chrome && window.chrome.webview) ? window.chrome.webview : null;
  var selftest = new URLSearchParams(location.search).get('selftest');
  var input = document.getElementById('inviteCode');
  var err = document.getElementById('inviteErr');
  var form = document.getElementById('inviteForm');

  function fail(msg) {
    err.textContent = msg || 'Ese código no está autorizado.';
    if (input) input.focus();
  }
  function openBase() {
    var files = [
      'vendor/three.min.js', 'vendor/OrbitControls.js', 'js/xlsx.js', 'js/db.js', 'js/layout.js',
      'js/slotting.js', 'js/scene.js', 'js/qrcode.js', 'js/orders.js', 'js/app.js', 'embedded-db.js'
    ];
    function step(i) {
      if (i >= files.length) { if (window.bootBodega) window.bootBodega(); return; }
      var s = document.createElement('script');
      s.src = files[i];
      s.onload = function () { step(i + 1); };
      s.onerror = function () { fail('No se pudo abrir la bodega. El código no autorizó la entrada.'); };
      document.body.appendChild(s);
    }
    step(0);
  }
  function b64(s) {
    var bin = atob(s), a = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return a;
  }
  function derive(code, salt) {
    return crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveBits']).then(function (key) {
      return crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt, iterations: 120000, hash: 'SHA-256' }, key, 256);
    });
  }
  function decryptAes(rawKey, iv, ct, mac) {
    var msg = new Uint8Array(iv.length + ct.length);
    msg.set(iv, 0); msg.set(ct, iv.length);
    return crypto.subtle.importKey('raw', rawKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']).then(function (hkey) {
      return crypto.subtle.verify('HMAC', hkey, mac, msg);
    }).then(function (ok) {
      if (!ok) throw new Error('mac');
      return crypto.subtle.importKey('raw', rawKey, { name: 'AES-CBC' }, false, ['decrypt']);
    }).then(function (akey) {
      return crypto.subtle.decrypt({ name: 'AES-CBC', iv: iv }, akey, ct);
    });
  }
  function openVault(code) {
    return fetch('vault.json', { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('novault');
      return r.json();
    }).then(function (vault) {
      var wraps = vault.wraps || [];
      function tryWrap(i) {
        if (i >= wraps.length) throw new Error('no');
        var w = wraps[i];
        return derive(code, b64(w.salt)).then(function (bits) {
          return decryptAes(new Uint8Array(bits), b64(w.iv), b64(w.ct), b64(w.mac));
        }).then(function (contentKey) {
          return decryptAes(new Uint8Array(contentKey), b64(vault.iv), b64(vault.ct), b64(vault.mac));
        }).catch(function () { return tryWrap(i + 1); });
      }
      return tryWrap(0);
    }).then(function (plain) {
      var text = new TextDecoder().decode(plain);
      var parts = JSON.parse(text);
      function step(i) {
        if (i >= parts.length) { if (window.bootBodega) window.bootBodega(); return; }
        var blob = new Blob([parts[i]], { type: 'text/javascript' });
        var s = document.createElement('script');
        s.src = URL.createObjectURL(blob);
        s.onload = function () { step(i + 1); };
        s.onerror = function () { fail('No se pudo abrir la bodega.'); };
        document.body.appendChild(s);
      }
      step(0);
    });
  }
  function submit(ev) {
    if (ev) ev.preventDefault();
    var code = (input.value || '').trim();
    if (!code) { fail('Escriba el código de invitación.'); return; }
    err.textContent = '';
    if (HOST) {
      function onMsg(e) {
        var d = e.data || {};
        if (d.type !== 'inviteOk' && d.type !== 'inviteFail') return;
        HOST.removeEventListener('message', onMsg);
        if (d.type === 'inviteOk') openBase();
        else fail();
      }
      HOST.addEventListener('message', onMsg);
      HOST.postMessage({ cmd: 'invite', code: code });
      return;
    }
    fetch('/api/invite', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code })
    }).then(function (r) {
      if (r.ok) return openBase();
      if (r.status === 404) return openVault(code);
      throw new Error('no');
    }).catch(function () { fail(); });
  }
  if (selftest && HOST) { openBase(); return; }
  form.addEventListener('submit', submit);
  if (input) input.focus();
})();
