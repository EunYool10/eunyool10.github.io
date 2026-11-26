// 설치 페이지: 기기 감지, 탭, 첫 화면 버튼, APK 정보, 앱 설치 버튼
(function () {
  var APK = 'apk/changui-lostfound-2.0.9.apk';
  var ua = navigator.userAgent || '';
  var isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var os = /Android/i.test(ua) ? 'android' : isIOS ? 'web' : /Mac/i.test(ua) ? 'mac' : /Windows/i.test(ua) ? 'windows' : 'web';

  // 설치 탭
  var tabs = document.querySelectorAll('.tabs button');
  function select(name, focus) {
    tabs.forEach(function (t) {
      var on = t.dataset.os === name;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
      if (on && focus) t.focus();
    });
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { select(t.dataset.os); });
    t.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var n = (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
      select(tabs[n].dataset.os, true);
    });
  });
  select(os);
  // 첫 화면의 '다른 기기' 링크: 그 기기 탭을 열고 설치로 이동
  document.querySelectorAll('.other a[data-os]').forEach(function (a) {
    a.addEventListener('click', function () { select(a.dataset.os); });
  });

  // 첫 화면: 이 기기에서 바로 할 일
  var main = document.getElementById('cta-main');
  var forText = document.getElementById('get-for');
  var factK = document.getElementById('fact-k');
  var factV = document.getElementById('fact-v');
  if (os === 'android') {
    forText.textContent = 'Android 휴대폰으로 보고 있어요';
    main.textContent = 'Android 앱 받기';
    main.href = APK;
    main.setAttribute('download', '');
  } else if (os === 'windows' || os === 'mac') {
    var name = os === 'mac' ? 'Mac' : 'Windows';
    forText.textContent = name + (os === 'mac' ? '으로' : '로') + ' 보고 있어요';
    main.textContent = name + '에 설치하기';
    main.href = '#install';
    factK.textContent = name;
    factV.textContent = (os === 'mac' ? 'Chrome · Edge · Safari' : 'Edge · Chrome') + '에서 앱으로 설치 · 무료';
  } else {
    forText.textContent = isIOS ? 'iPhone · iPad로 보고 있어요' : '이 브라우저에서 바로 쓸 수 있어요';
    main.textContent = '웹에서 열기';
    main.href = 'app/';
    document.getElementById('cta-web').textContent = 'iPhone 설치 방법';
    document.getElementById('cta-web').href = '#install';
    factK.textContent = 'iPhone · 웹';
    factV.textContent = "Safari에서 '홈 화면에 추가' · 무료";
  }

  // APK 크기와 SHA-256 (version.json)
  fetch('version.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (v) {
    if (!v || !v.android) return;
    if (v.android.sha256) document.getElementById('apk-sha').textContent = v.android.sha256;
    if (v.android.size) {
      var mb = (v.android.size / 1048576).toFixed(1) + 'MB';
      document.querySelectorAll('.apk-size').forEach(function (e) { e.textContent = mb; });
    }
  }).catch(function () {});

  // Windows·Mac 앱 설치 (Chrome, Edge)
  var prompt = null;
  var standalone = matchMedia('(display-mode: standalone)').matches;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); prompt = e; });
  window.addEventListener('appinstalled', function () { showNote('설치했어요. 시작 메뉴나 Dock에서 "분실물 센터"를 열어 보세요.'); });
  function showNote(text) {
    document.querySelectorAll('.install-note').forEach(function (n) { n.textContent = text; n.hidden = false; });
  }
  document.querySelectorAll('.install-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      if (standalone) return showNote('이미 앱으로 열려 있어요.');
      if (prompt) {
        prompt.prompt();
        prompt.userChoice.then(function () { prompt = null; });
        return;
      }
      if (/Safari/.test(ua) && !/Chrome|Edg/.test(ua)) {
        showNote('Safari에서는 메뉴 막대의 파일 › Dock에 추가를 눌러 주세요.');
      } else {
        showNote('이 브라우저에서는 설치 버튼을 바로 띄울 수 없어요. 주소창 오른쪽의 설치 아이콘을 누르거나, 브라우저 메뉴에서 "앱 설치" 또는 "이 사이트를 앱으로 설치"를 눌러 주세요. 이미 설치했다면 시작 메뉴나 Dock에서 열면 돼요.');
      }
    });
  });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
})();
