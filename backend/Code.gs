/**
 * pharmarom tesoro — 백엔드 (Google Apps Script)
 * 개인 독서 기록: 인증·기기 간 동기화·비공개 사진 저장·드라이브 OCR·YES24 검색
 *
 * ── 설정값은 코드가 아니라 "스크립트 속성(Script Properties)"에 저장합니다 ──
 *   APP_PW          : 로그인 비밀번호 (나만 아는 값)
 *   YES24_KEY       : YES24 Open API 키
 *   PHOTO_FOLDER_ID : 비공개 드라이브 폴더 ID (사진 보관, 공유하지 말 것)
 *
 * 설정 방법·배포는 '설정안내.md' 참고.
 * ⚠ 이 스크립트는 구글 시트에 "바인딩"된 상태로 쓰세요(시트 열고 확장프로그램→Apps Script).
 * ⚠ OCR을 쓰려면 Apps Script 편집기에서 서비스 "Drive API(고급 서비스)"를 켜야 합니다.
 */

// ===== 설정 읽기 =====
var P = PropertiesService.getScriptProperties();
function cfg(k, d) { var v = P.getProperty(k); return (v === null || v === undefined) ? (d || '') : v; }

// 데이터 시트: SHEET_ID 속성이 있으면 그 시트를 열고(독립형), 없으면 바인딩된 시트 사용
function ss_() {
  var id = cfg('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

var SHEETS = { book: 'books', block: 'blocks', thought: 'thoughts' };
var SESSION_SHEET = 'sessions';
var SESSION_DAYS = 180;
var YES24_BASE = 'https://apis.yes24.com/v1/goods/itemList';

// ===== 엔트리 =====
function doPost(e) { return handle(e); }
function doGet(e) { return handle(e); }

function handle(e) {
  var p = {};
  try {
    if (e && e.postData && e.postData.contents) p = JSON.parse(e.postData.contents);
    else if (e && e.parameter) p = e.parameter;
  } catch (err) { p = (e && e.parameter) || {}; }

  var action = p.action;
  try {
    if (action === 'ping') return json({ ok: true, ts: Date.now() });
    if (action === 'login') return doLogin(p);

    // 그 외 모든 요청은 유효한 토큰 필요 (서버에서 접근권한 검사)
    if (!validToken(p.token)) return json({ ok: false, error: 'auth' });

    if (action === 'pull') return json(doPull(Number(p.since) || 0));
    if (action === 'push') return json(doPush(p.changes || []));
    if (action === 'uploadPhoto') return json(doUploadPhoto(p));
    if (action === 'ocr') return json(doOcr(p));
    if (action === 'photo') return json(doPhoto(p));
    if (action === 'search') return json(doSearch(p.q));
    return json({ ok: false, error: 'unknown_action' });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ===== 인증 =====
function doLogin(p) {
  var pw = String(p.pw || '');
  var real = cfg('APP_PW');
  if (!real) return json({ ok: false, error: 'no_pw_set' });
  if (pw !== real) return json({ ok: false, error: 'bad-pw' });
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  var sh = sheet(SESSION_SHEET, ['token', 'createdAt', 'expiresAt']);
  var exp = Date.now() + SESSION_DAYS * 24 * 3600 * 1000;
  sh.appendRow([token, Date.now(), exp]);
  return json({ ok: true, token: token });
}
function validToken(token) {
  token = String(token || '');
  if (!token) return false;
  var sh = sheet(SESSION_SHEET, ['token', 'createdAt', 'expiresAt']);
  var vals = sh.getDataRange().getValues();
  var nowMs = Date.now();
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) === token) {
      if (Number(vals[i][2]) > nowMs) return true;
      return false; // 만료
    }
  }
  return false;
}

// ===== 시트 유틸 (엔터티 = id | data(JSON) | version | updatedAt | deleted) =====
function sheet(name, headers) {
  var ss = ss_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (headers) sh.appendRow(headers);
  }
  return sh;
}
function entitySheet(kind) { return sheet(SHEETS[kind], ['id', 'data', 'version', 'updatedAt', 'deleted']); }

function findRow(sh, id) {
  var vals = sh.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) { if (String(vals[i][0]) === String(id)) return { row: i + 1, vals: vals[i] }; }
  return null;
}

// ===== pull: since 이후 변경분 =====
function doPull(since) {
  var out = [];
  Object.keys(SHEETS).forEach(function (kind) {
    var sh = entitySheet(kind);
    var vals = sh.getDataRange().getValues();
    for (var i = 1; i < vals.length; i++) {
      var updatedAt = Number(vals[i][3]) || 0;
      if (updatedAt > since) {
        var obj;
        try { obj = JSON.parse(vals[i][1]); } catch (e) { obj = {}; }
        obj.kind = kind; obj.version = Number(vals[i][2]) || 0;
        obj.deleted = (String(vals[i][4]) === 'true' || vals[i][4] === true);
        out.push(obj);
      }
    }
  });
  return { ok: true, changes: out, now: Date.now() };
}

// ===== push: 버전 검사 후 upsert, 충돌이면 서버값 반환(덮어쓰지 않음) =====
function doPush(changes) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var results = [];
    changes.forEach(function (ch) {
      var kind = ch.kind, id = ch.id;
      if (!SHEETS[kind] || !id) { results.push({ kind: kind, id: id, ok: false, error: 'bad' }); return; }
      var sh = entitySheet(kind);
      var found = findRow(sh, id);

      if (ch.purge) {
        if (found) sh.deleteRow(found.row);
        results.push({ kind: kind, id: id, purged: true });
        return;
      }
      var nowMs = Date.now();
      if (!found) {
        var v = 1;
        sh.appendRow([id, JSON.stringify(ch.obj), v, nowMs, !!ch.obj.deleted]);
        results.push({ kind: kind, id: id, ok: true, version: v });
      } else {
        var curVer = Number(found.vals[2]) || 0;
        var base = Number(ch.baseVersion) || 0;
        if (curVer !== base) {
          // 충돌: 서버가 더 최신 — 덮어쓰지 않고 서버값 반환
          var sObj; try { sObj = JSON.parse(found.vals[1]); } catch (e) { sObj = {}; }
          sObj.kind = kind; sObj.version = curVer;
          sObj.deleted = (String(found.vals[4]) === 'true' || found.vals[4] === true);
          results.push({ kind: kind, id: id, conflict: true, server: sObj });
        } else {
          var nv = curVer + 1;
          sh.getRange(found.row, 2, 1, 4).setValues([[JSON.stringify(ch.obj), nv, nowMs, !!ch.obj.deleted]]);
          results.push({ kind: kind, id: id, ok: true, version: nv });
        }
      }
    });
    return { ok: true, results: results };
  } finally {
    lock.releaseLock();
  }
}

// ===== 사진 업로드 (비공개 폴더) =====
function photoFolder() {
  var fid = cfg('PHOTO_FOLDER_ID');
  if (!fid) throw new Error('PHOTO_FOLDER_ID 미설정');
  return DriveApp.getFolderById(fid);
}
function doUploadPhoto(p) {
  var photoId = String(p.photoId || '');
  var data = String(p.data || '');
  if (!photoId || !data) return { ok: false, error: 'empty' };
  var folder = photoFolder();
  // 같은 photoId 재업로드면 기존 파일 제거(중복 방지)
  var existing = folder.getFilesByName(photoId + '.jpg');
  while (existing.hasNext()) existing.next().setTrashed(true);
  var blob = Utilities.newBlob(Utilities.base64Decode(data), 'image/jpeg', photoId + '.jpg');
  var file = folder.createFile(blob);
  return { ok: true, photoFileId: file.getId() };
}

// ===== 드라이브 OCR (무료, 본인 계정 내부) =====
// 요구: Apps Script 편집기 → 서비스 → "Drive API" 추가 (고급 서비스, 식별자 Drive)
function doOcr(p) {
  var fileId = String(p.photoFileId || '');
  if (!fileId) return { ok: false, error: 'no_file' };
  var file = DriveApp.getFileById(fileId);
  var blob = file.getBlob();
  var tempDoc = null;
  try {
    var inserted = Drive.Files.insert(
      { title: 'ocr-temp-' + Date.now(), mimeType: 'application/vnd.google-apps.document' },
      blob,
      { ocr: true, ocrLanguage: 'ko' }
    );
    tempDoc = inserted.id;
    var text = DocumentApp.openById(tempDoc).getBody().getText();
    return { ok: true, text: text || '' };
  } catch (err) {
    return { ok: false, error: 'ocr_fail: ' + (err && err.message || err) };
  } finally {
    if (tempDoc) { try { DriveApp.getFileById(tempDoc).setTrashed(true); } catch (e) {} }
  }
}

// ===== 사진 인증 조회 (공개 URL 미노출, base64 반환) =====
function doPhoto(p) {
  var fileId = String(p.photoFileId || '');
  if (!fileId) return { ok: false, error: 'no_file' };
  try {
    var blob = DriveApp.getFileById(fileId).getBlob();
    return { ok: true, mime: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
  } catch (err) {
    return { ok: false, error: 'not_found' };
  }
}

// ===== YES24 검색 =====
function doSearch(q) {
  q = String(q || '').trim();
  if (!q) return { ok: true, items: [] };
  var key = cfg('YES24_KEY');
  if (!key) return { ok: false, error: 'no_yes24_key' };
  var url = YES24_BASE + '?query=' + encodeURIComponent(q) + '&category=BOOK&detail=Y&pageSize=24';
  var res = UrlFetchApp.fetch(url, { method: 'get', headers: { 'X-Api-Key': key }, muteHttpExceptions: true });
  var data;
  try { data = JSON.parse(res.getContentText()); } catch (e) { return { ok: false, error: 'parse' }; }
  if (!data || !data.success || !data.data || !data.data.items) return { ok: false, error: 'yes24_' + (res.getResponseCode()) };
  var items = data.data.items.map(function (it) {
    return {
      title: String(it.title || '').trim(),
      author: it.author || '',
      publisher: it.publisher || '',
      pubDate: it.publishDate || '',
      cover: https(it.cover || ''),
      isbn13: it.isbn13 || it.isbn10 || '',
      yes24Id: it.goodsNo || it.id || '',
      link: it.link || ''
    };
  });
  return { ok: true, items: items };
}
function https(u) { return String(u || '').replace(/^http:\/\//i, 'https://'); }

// ===== 설정 도우미 (편집기에서 한 번 실행하면 Script Properties 입력창 대신 코드로 세팅) =====
// 값을 채운 뒤 이 함수를 실행하세요. (실행 후 보안을 위해 값은 지워도 됩니다)
// 추천: 시트에 바인딩된 스크립트(시트에서 확장 프로그램→Apps Script로 연 경우).
// 아래 3개 값만 채우고 이 함수(SETUP_config)를 실행하면 끝입니다.
function SETUP_config() {
  PropertiesService.getScriptProperties().setProperties({
    APP_PW: '여기에_로그인_비밀번호',
    YES24_KEY: '여기에_YES24_키',
    PHOTO_FOLDER_ID: '여기에_비공개_드라이브_폴더ID'
  });
}

// (독립형 스크립트를 쓰는 경우에만) 데이터 구글시트 ID를 따로 지정합니다.
// 시트에 바인딩해 쓰는 추천 방식에서는 절대 실행하지 마세요.
function SETUP_standaloneSheetId() {
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', '여기에_데이터_구글시트_ID');
}
