/* Saegim 컴포즈 파서 (JS 포팅 — app/Saegim/Sources/Parsing/*.swift 규칙 이식).
   결정론 규칙 기반, 네트워크/LLM 없음. 날짜·시간·반복·사람·장소 토큰 추출 +
   3분류(todo/schedule/routine) + 제목 정제 + 카테고리 추론. */
(function (global) {
  "use strict";

  var WEEKDAYS = { 일: 1, 월: 2, 화: 3, 수: 4, 목: 5, 금: 6, 토: 7,
                   일요일: 1, 월요일: 2, 화요일: 3, 수요일: 4, 목요일: 5, 금요일: 6, 토요일: 7 };
  var WEEKDAY_CODES = ["", "SU", "MO", "TU", "WE", "TH", "FR", "SA"];

  var RE = {
    relDay: /오늘|내일|모레|글피/,
    nextWeek: /다음\s*주\s*(월요일|화요일|수요일|목요일|금요일|토요일|일요일|월|화|수|목|금|토|일)/,
    time: /(오전|오후)?\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/,
    recur: /매주\s*((?:[월화수목금토일]\s*(?:,|·|、)?\s*)+)/,
    daily: /매일/,
    person: /([가-힣]{1,6}?)(?:이랑|랑|와|과|하고)(?=\s|$)/g,
    place: /([가-힣]+(?:\s+[가-힣]+){0,2})에서/
  };
  var COMPANION = ["이랑", "랑", "와", "과", "하고"];

  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

  function nextOccurrence(weekday, from, weeksAhead) {
    // weekday: 1=Sun..7=Sat (Swift Calendar). JS getDay(): 0=Sun..6=Sat.
    var base = new Date(from); base.setDate(base.getDate() + weeksAhead * 7);
    var target = weekday - 1; // -> JS getDay
    var cur = base.getDay();
    var diff = (target - cur + 7) % 7;
    var d = startOfDay(base); d.setDate(d.getDate() + diff);
    return d;
  }

  var CATEGORY_KEYWORDS = [
    ["exercise", ["운동", "필라테스", "헬스", "달리기", "러닝", "요가", "수영", "클라이밍", "테니스", "골프"]],
    ["appointment", ["약속", "미팅", "회의", "저녁", "점심", "커피", "만남", "데이트", "면접", "상담"]],
    ["family", ["엄마", "아빠", "가족", "부모님", "할머니", "할아버지"]],
    ["work", ["업무", "보고서", "발표", "출근", "프로젝트", "마감", "정산"]],
    ["chore", ["청소", "빨래", "설거지", "장보기", "분리수거", "정리"]]
  ];
  function inferCategory(text) {
    for (var i = 0; i < CATEGORY_KEYWORDS.length; i++) {
      var kws = CATEGORY_KEYWORDS[i][1];
      for (var j = 0; j < kws.length; j++) if (text.indexOf(kws[j]) !== -1) return CATEGORY_KEYWORDS[i][0];
    }
    return "uncategorized";
  }

  // 제목 정제: 날짜/시간/반복 스팬 제거 + 잔여 조사 정리. 사람/장소는 남긴다.
  var TRAILING_PARTICLES = ["에는", "에서", "부터", "까지", "에", "은", "는", "이", "가", "을", "를", "로", "으로"];
  function cleanTitle(text, spans) {
    var removable = spans
      .filter(function (s) { return s.kind === "date" || s.kind === "time" || s.kind === "recurrence"; })
      .sort(function (a, b) { return b.start - a.start; });
    var result = text;
    removable.forEach(function (s) {
      var upper = s.end;
      var rest = result.slice(upper);
      for (var i = 0; i < TRAILING_PARTICLES.length; i++) {
        if (rest.indexOf(TRAILING_PARTICLES[i]) === 0) { upper += TRAILING_PARTICLES[i].length; break; }
      }
      result = result.slice(0, s.start) + result.slice(upper);
    });
    return result.trim().replace(/ {2,}/g, " ");
  }

  function parse(text, now) {
    now = now || new Date();
    var spans = [];
    var out = { spans: spans, resolvedDate: null, resolvedStartAt: null, recurrenceRule: null };
    if (!text || !text.trim()) { out.suggestedKind = "todo"; out.title = ""; out.category = "uncategorized"; return out; }

    var resolvedDay = null, m;

    // 상대 날짜
    if ((m = RE.relDay.exec(text))) {
      var off = { "오늘": 0, "내일": 1, "모레": 2, "글피": 3 }[m[0]] || 0;
      resolvedDay = startOfDay(now); resolvedDay.setDate(resolvedDay.getDate() + off);
      spans.push({ kind: "date", text: m[0], start: m.index, end: m.index + m[0].length });
    }
    // 다음주 요일
    if (!resolvedDay && (m = RE.nextWeek.exec(text))) {
      var wd = WEEKDAYS[m[1]];
      if (wd) { resolvedDay = nextOccurrence(wd, now, 1); spans.push({ kind: "date", text: m[0], start: m.index, end: m.index + m[0].length }); }
    }
    // 반복: 매주 X / 매일
    if ((m = RE.recur.exec(text))) {
      var codes = [];
      for (var i = 0; i < m[1].length; i++) { var c = WEEKDAYS[m[1][i]]; if (c) codes.push(WEEKDAY_CODES[c]); }
      if (codes.length) { out.recurrenceRule = "WEEKLY;BYDAY=" + codes.join(","); spans.push({ kind: "recurrence", text: m[0], start: m.index, end: m.index + m[0].length }); }
    } else if ((m = RE.daily.exec(text))) {
      out.recurrenceRule = "DAILY"; spans.push({ kind: "recurrence", text: m[0], start: m.index, end: m.index + m[0].length });
    }
    // 시간: 오후 8시 / 오전 9시 30분
    if ((m = RE.time.exec(text))) {
      var meridiem = m[1] || null, hour = parseInt(m[2], 10), minute = m[3] ? parseInt(m[3], 10) : 0;
      if (meridiem === "오후" && hour < 12) hour += 12;
      if (meridiem === "오전" && hour === 12) hour = 0;
      var baseDay = resolvedDay ? new Date(resolvedDay) : startOfDay(now);
      baseDay.setHours(hour, minute, 0, 0);
      out.resolvedStartAt = baseDay;
      spans.push({ kind: "time", text: m[0], start: m.index, end: m.index + m[0].length });
    }
    // 사람: N랑/와/과/하고
    RE.person.lastIndex = 0;
    while ((m = RE.person.exec(text))) {
      var pStart = m.index + m[0].indexOf(m[1]);
      spans.push({ kind: "person", text: m[1], start: pStart, end: pStart + m[1].length });
    }
    // 장소: N에서 (선행 동반어/구조 토큰 트림)
    if ((m = RE.place.exec(text))) {
      var phrase = m[1], phraseStart = m.index;
      var structural = spans.filter(function (s) { return s.kind === "date" || s.kind === "time" || s.kind === "recurrence"; });
      var words = [], cursor = phraseStart;
      phrase.split(" ").forEach(function (tok) {
        if (tok) words.push({ text: tok, start: cursor, end: cursor + tok.length });
        cursor += tok.length + 1;
      });
      while (words.length > 1) {
        var first = words[0];
        var isCompanion = COMPANION.some(function (suf) { return first.text.slice(-suf.length) === suf; });
        var overlaps = structural.some(function (s) { return s.start < first.end && first.start < s.end; });
        if (isCompanion || overlaps) words.shift(); else break;
      }
      if (words.length) {
        var last = words[words.length - 1];
        spans.push({ kind: "place", text: text.slice(words[0].start, last.end), start: words[0].start, end: last.end });
      }
    }

    out.resolvedDate = resolvedDay || (out.resolvedStartAt ? startOfDay(out.resolvedStartAt) : null);
    out.suggestedKind = out.recurrenceRule ? "routine" : (out.resolvedStartAt ? "schedule" : "todo");
    out.title = cleanTitle(text, spans) || text.trim();
    out.category = inferCategory(text);
    return out;
  }

  global.SaegimParser = { parse: parse, cleanTitle: cleanTitle };
})(typeof window !== "undefined" ? window : this);
