const p = smPad;

var APPS = [
  { href:'./apps/sensor-report/', accent:'#2563EB', accentBg:'#EAF1FE',
    icon:'<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M5 8V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2"/><path d="M8 13l2.5 3 2-2.5L16 18"/>',
    tag:'진동 · 온도', name:'센서 보고서', desc:'설비 진동·온도 데이터를 수집해 상태 리포트로 정리합니다.', ready:true },
  { href:'./apps/belt-tension/', accent:'#0EA5A4', accentBg:'#E3F6F5',
    icon:'<circle cx="6" cy="12" r="3"/><circle cx="18" cy="12" r="3"/><path d="M6 9h12"/><path d="M6 15h12"/>',
    tag:'장력 N', name:'벨트 장력계', desc:'컨베이어 벨트의 장력을 측정하고 기준값과 비교합니다.', ready:true },
  { href:'./apps/belt-tension-2.0/', accent:'#7C3AED', accentBg:'#F1ECFE',
    icon:'<path d="M4 10v4"/><path d="M8 7v10"/><path d="M12 4v16"/><path d="M16 8v8"/><path d="M20 11v2"/>',
    tag:'소음 dB', name:'데시벨 측정', desc:'설비 가동 소음 레벨을 실시간으로 측정합니다.', ready:true },
  { href:'./apps/test/', accent:'#94A3B8', accentBg:'#EEF1F4', icoColor:'#64748B', tagColor:'#64748B',
    icon:'<path d="M9 3h6"/><path d="M10 3v6l-4.5 8a2 2 0 0 0 1.8 3h9.4a2 2 0 0 0 1.8-3L14 9V3"/><path d="M7 14h10"/>',
    tag:'SANDBOX', name:'테스트 앱', desc:'신규 기능을 점검하는 샌드박스 환경입니다.', ready:false }
];

(function(){
  var CHECK = '<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>';

  document.getElementById('app-grid').innerHTML = APPS.map(function(a){
    var icoS = a.icoColor ? ' style="color:'+a.icoColor+';background:'+a.accentBg+';"' : '';
    var tagS = a.tagColor ? ' style="color:'+a.tagColor+';background:'+a.accentBg+';"' : '';
    var openS = a.ready ? '' : ' style="color:#64748B;"';
    var pill = a.ready
      ? '<span class="pill ok">'+CHECK+'사용 가능</span>'
      : '<span class="pill dev">개발 중</span>';
    return '<a class="card" href="'+a.href+'" style="--accent:'+a.accent+';--accent-bg:'+a.accentBg+';">'+
      '<div class="card-top">'+
        '<span class="ico"'+icoS+'><svg viewBox="0 0 24 24">'+a.icon+'</svg></span>'+
        '<span class="tag"'+tagS+'>'+a.tag+'</span>'+
      '</div>'+
      '<div class="card-body">'+
        '<div class="name">'+a.name+'</div>'+
        '<div class="desc">'+a.desc+'</div>'+
      '</div>'+
      '<div class="card-foot">'+pill+'<span class="open"'+openS+'>열기 &rarr;</span></div>'+
    '</a>';
  }).join('');

  document.getElementById('app-count').textContent = '앱 '+APPS.length+'개';
  document.getElementById('foot-ver').textContent = 'v1.0.0 · '+APPS.length+' apps';

  smStartClock('when', 30000);
})();
