// Supabase の REST API（secret key はスクリプトプロパティから読む）と時刻の表示。

function supabase_(method, path, body, prefer) {
  const props = PropertiesService.getScriptProperties();
  const base = String(props.getProperty('SUPABASE_URL') || '').replace(/\/$/, '');
  const key = props.getProperty('SUPABASE_SECRET_KEY');
  const headers = { apikey: key, Accept: 'application/json' };
  if (String(key).indexOf('eyJ') === 0) headers.Authorization = 'Bearer ' + key;  // 旧形式の JWT キーだけ
  if (prefer) headers.Prefer = prefer;
  const options = { method: method.toLowerCase(), headers, muteHttpExceptions: true };
  if (body !== undefined) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(body);
  }
  const res = UrlFetchApp.fetch(base + '/rest/v1/' + path, options);
  const code = res.getResponseCode();
  if (code >= 300) throw new Error('Supabase ' + method + ' ' + path.split('?')[0] + ' → ' + code + ' ' + res.getContentText().slice(0, 300));
  const text = res.getContentText();
  return text ? JSON.parse(text) : null;
}

function jst_(ms) {
  return Utilities.formatDate(new Date(ms), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
}
