/**
 * 薬局向けAI業務効率化ツール (Pharma AI Tools)
 * Google Apps Script (GAS) バックエンド
 */

const GET_API_KEY = () => PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
const GEMINI_MODEL = "gemini-2.5-flash"; 
const TARGET_SPREADSHEET_ID = "1Xe52ARdmONGVAoaPn7EIslLAYioXk77GRSQ39cRhr_k"; 
const TARGET_SHEET_NAME = "シート1";

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const type = payload.type; 
    const imageBase64 = payload.image;
    const mimeType = payload.mimeType;

    if (!imageBase64 || !mimeType) throw new Error("Invalid request: Missing image data or mime type.");

    let resultData = null;
    if (type === "notebook") resultData = processNotebook(imageBase64, mimeType);
    else if (type === "questionnaire") resultData = processQuestionnaire(imageBase64, mimeType);
    else throw new Error("Invalid request type.");

    return createJsonResponse({ status: "success", data: resultData });
  } catch (error) {
    console.error(error);
    return createJsonResponse({ status: "error", message: error.toString() });
  }
}

function createJsonResponse(responseObject) {
  return ContentService.createTextOutput(JSON.stringify(responseObject)).setMimeType(ContentService.MimeType.JSON);
}

function processNotebook(imageBase64, mimeType) {
  const prompt = `あなたは薬剤師をサポートするAIです。
提供されたお薬手帳（または処方箋）の画像から、「医薬品名」のみをすべて抽出してください。
以下のルールを厳守してください。
- 用法用量、日数は含めないでください。
- 患者名や調剤日などの個人情報は含めないでください。
- 余計な挨拶や説明は一切書かず、医薬品名だけを1行に1つずつ（改行区切りで）出力してください。
- 【重要】一般名処方（「【般】〇〇」）と、それに対応する実際に調剤された製品名（「〇〇「メーカー名」」）の両方が画像に記載されている場合は、実際の製品名のみを出力し、「【般】」の行は除外してください。
  例: 「【般】テルミサルタン錠20mg」と「テルミサルタン錠20mg「サワイ」」が両方ある場合 → 「テルミサルタン錠20mg「サワイ」」のみ出力。
- ただし、対応する製品名が記載されておらず「【般】〇〇」のみの場合は、「【般】」付きでそのまま出力してください。`;

  return callGeminiAPI(prompt, imageBase64, mimeType).trim();
}

function processQuestionnaire(imageBase64, mimeType) {
  const prompt = `あなたは医療機関の事務作業を自動化するAIです。
提供された問診票の画像から、手書きの回答内容を読み取り、指定されたJSONスキーマに従って出力してください。
チェックがついていない項目は null または空配列にしてください。純粋なJSON文字列のみを出力してください。

【JSONスキーマの要件】
{
  "name": "文字列(氏名)",
  "phone": "文字列(電話番号)",
  "patient-condition": "pregnant(妊娠中)/breastfeeding(授乳中)/pediatric(小児)/none(該当なし)",
  "weight": "数値(女性または小児の体重。単位kgは不要)",
  
  "generic": "prefer(ジェネリック希望)/avoid(先発希望)/ag(先発(AGなら希望))",
  
  "booklet": "yes(あり)/no(なし)",
  "booklet-type": "paper(紙)/digital(電子)/null",
  
  "history": "配列: ['hypertension', 'diabetes', 'heart', 'kidney', 'liver', 'asthma', 'epilepsy', 'glaucoma', 'prostate', 'other']",
  "history-other-detail": "文字列(その他の詳細)",
  
  "hayfever-type": "配列: ['sugi', 'hinoki', 'ine', 'butakusa', 'kamogaya']",
  "env-allergy": "配列: ['hayfever', 'housedust', 'mite', 'dog-cat', 'temp', 'perennial', 'testing', 'other']",
  
  "drug-allergy": "yes(ある)/no(ない)",
  "drug-allergy-detail": "文字列(詳細)",
  
  "food-allergy": "yes(ある)/no(ない)",
  "food-allergy-detail": "文字列(詳細)",
  
  "current-presc": "yes(ある)/no(ない)",
  "current-presc-detail": "文字列(詳細)",
  
  "otc-list": "配列: ['cold', 'pain', 'rhinitis', 'stomach', 'constipation', 'kanpo', 'eye', 'vitamin', 'multi-mineral', 'iron', 'zinc', 'calcium', 'magnesium', 'dha-epa', 'protein', 'other']",
  "otc-suppl-detail": "文字列(詳細)",
  
  "food-drink": "配列: ['coffee-tea', 'grapefruit', 'dairy', 'other']",
  "food-drink-detail": "文字列(その他の詳細)",
  
  "smoking": "yes(吸う)/no(吸わない)",
  "driving": "yes(する)/no(しない)",
  "height-work": "yes(ある)/no(ない)",
  "alcohol": "none(飲まない)/occasionally(時々)/daily(毎日)",
  
  "memo": "文字列(その他の要望や質問事項)"
}`;

  let responseText = callGeminiAPI(prompt, imageBase64, mimeType);
  responseText = responseText.replace(/\`\`\`json/g, "").replace(/\`\`\`/g, "").trim();
  
  let structuredData;
  try {
    structuredData = JSON.parse(responseText);
  } catch (e) {
    throw new Error("Gemini APIからの応答をJSONとして解析できませんでした。\n応答内容: " + responseText);
  }

  saveToSpreadsheet(structuredData);
  return translateDataToJapanese(structuredData);
}

function callGeminiAPI(prompt, imageBase64, mimeType) {
  const apiKey = GET_API_KEY();
  if (!apiKey) throw new Error("Gemini API Key が設定されていません。GASのスクリプトプロパティを確認してください。");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const payload = { "contents": [{ "parts": [{ "text": prompt }, { "inlineData": { "mimeType": mimeType, "data": imageBase64 } }] }] };

  const options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };

  const response = UrlFetchApp.fetch(url, options);
  const json = JSON.parse(response.getContentText());

  if (response.getResponseCode() !== 200) throw new Error(`Gemini API Error: ${json.error?.message || "Unknown error"}`);
  if (json.candidates && json.candidates.length > 0) return json.candidates[0].content.parts[0].text;
  throw new Error("Gemini APIから有効なテキストが返却されませんでした。");
}

function saveToSpreadsheet(data) {
  const ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
  const sheet = ss.getSheets()[0]; 
  
  if (sheet.getLastColumn() === 0 || sheet.getRange(1, 1).getValue() === "") {
    const headers = [
      '日時', '名前', '電話番号', '状態', '妊婦体重', '授乳婦体重', '小児体重',
      '薬アレルギー', 'アレルギー詳細', '食品アレルギー', '食品詳細', '環境アレルギー',
      '副作用', '副作用詳細', '他院処方', '他院詳細', '市販薬', '市販薬詳細', 
      '飲食物', '飲食物詳細', '既往歴', '既往歴詳細', '運転', '高所', 'ソフトコンタクト', 
      '酒', '煙草', 'ジェネリック', '備考', 'お薬手帳'
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setBackground('#eeeeee').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  const tMap = {
    'yes': 'あり', 'no': 'なし',
    'prefer': 'ジェネリック希望', 'avoid': '先発希望', 'ag': '先発（AGなら希望）',
    'none': 'なし/飲まない', 'occasionally': '時々', 'daily': '毎日',
    'cold': '風邪薬', 'pain': '痛み止め', 'rhinitis': '鼻炎薬', 'stomach': '胃腸薬',
    'constipation': '便秘薬', 'kanpo': '漢方薬', 'eye': '目薬', 'vitamin': 'ビタミン',
    'mineral': 'ミネラル', 'multi-mineral': 'マルチミネラル', 'iron': '鉄', 'zinc': '亜鉛', 
    'magnesium': 'マグネシウム', 'calcium': 'カルシウム', 'dha-epa': 'DHA/EPA', 'protein': 'プロテイン',
    'coffee-tea': 'コーヒー・紅茶', 'grapefruit': 'グレープフルーツジュース', 'dairy': '乳製品',
    'hayfever': '花粉症', 'housedust': 'ハウスダスト', 'mite': 'ダニ',
    'dog-cat': '犬・猫', 'temp': '寒暖差', 'perennial': '通年性', 'testing': 'アレルギーの検査中',
    'hypertension': '高血圧', 'diabetes': '糖尿病', 'heart': '心臓病', 
    'kidney': '腎臓病', 'liver': '肝臓病', 'asthma': '喘息', 
    'epilepsy': 'てんかん', 'glaucoma': '緑内障', 'prostate': '前立腺肥大',
    'other': 'その他',
    'pregnant': '妊娠中', 'breastfeeding': '授乳中', 'pediatric': '小児'
  };

  const hayfeverTypeLabels = {
      'sugi': 'スギ', 'hinoki': 'ヒノキ', 'ine': 'イネ', 'butakusa': 'ブタクサ', 'kamogaya': 'カモガヤ'
  };

  const translate = (val) => {
    if (!val) return 'なし';
    if (Array.isArray(val)) return val.map(v => tMap[v] || v).join(', ');
    if (typeof val === 'string' && val.includes(',')) return val.split(',').map(v => tMap[v.trim()] || v.trim()).join(', ');
    return tMap[val] || val;
  };

  let pWeight = '', bWeight = '', pedWeight = '';
  if (data['patient-condition'] === 'pregnant') pWeight = data.weight || '';
  if (data['patient-condition'] === 'breastfeeding') bWeight = data.weight || '';
  if (data['patient-condition'] === 'pediatric') pedWeight = data.weight || '';

  let bookletVal = 'なし';
  if (data['booklet'] === 'yes') {
    bookletVal = 'あり' + (data['booklet-type'] === 'paper' ? '(紙)' : (data['booklet-type'] === 'digital' ? '(電子)' : ''));
  }

  const row = [
    new Date(), 
    data.name || '', 
    data.phone || '', 
    translate(data['patient-condition']) || '該当なし',
    pWeight,
    bWeight,
    pedWeight,
    translate(data['drug-allergy']), 
    data['drug-allergy-detail'] || '', 
    translate(data['food-allergy']), 
    data['food-allergy-detail'] || '', 
    (() => {
      let envAllergies = Array.isArray(data['env-allergy']) ? data['env-allergy'].map(v => tMap[v] || v) : [tMap[data['env-allergy']] || data['env-allergy']];
      envAllergies = envAllergies.filter(Boolean);

      if (data['env-allergy'] && data['env-allergy'].includes('hayfever') && data['hayfever-type'] && data['hayfever-type'].length > 0) {
          const types = data['hayfever-type'].map(t => hayfeverTypeLabels[t] || t).join('・');
          envAllergies = envAllergies.map(a => a === '花粉症' ? `花粉症(${types})` : a);
      }
      return envAllergies.length > 0 ? envAllergies.join(', ') : 'なし';
    })(),
    'なし', // 副作用 (紙問診に項目なし)
    '',     // 副作用詳細
    translate(data['current-presc']), 
    data['current-presc-detail'] || '', 
    translate(data['otc-list']), 
    data['otc-suppl-detail'] || '', 
    translate(data['food-drink']),
    data['food-drink-detail'] || '',
    translate(data.history), 
    data['history-other-detail'] || '', 
    translate(data.driving), 
    translate(data['height-work']), 
    'なし', // ソフトコンタクト (紙問診に項目なし)
    translate(data.alcohol || 'none'), 
    translate(data.smoking), 
    translate(data.generic), 
    data.memo || '',
    bookletVal
  ];

  sheet.appendRow(row);
  CacheService.getScriptCache().remove('submissions_cache');
}

/**
 * 抽出データを完全日本語化して返す
 */
function translateDataToJapanese(data) {
  const keyMap = {
    'name': '氏名',
    'phone': '電話番号',
    'patient-condition': '患者状態',
    'weight': '体重(kg)',
    'generic': 'ジェネリック希望',
    'booklet': 'お薬手帳',
    'booklet-type': '手帳タイプ',
    'history': '既往歴',
    'history-other-detail': '既往歴詳細',
    'hayfever-type': '花粉症タイプ',
    'env-allergy': '環境アレルギー',
    'drug-allergy': '薬アレルギー',
    'drug-allergy-detail': '薬アレルギー詳細',
    'food-allergy': '食品アレルギー',
    'food-allergy-detail': '食品アレルギー詳細',
    'current-presc': '他院処方',
    'current-presc-detail': '他院処方詳細',
    'otc-list': '市販薬・サプリメント',
    'otc-suppl-detail': '市販薬詳細',
    'food-drink': '飲食物',
    'food-drink-detail': '飲食物詳細',
    'smoking': '喫煙',
    'driving': '運転',
    'height-work': '高所作業',
    'alcohol': '飲酒',
    'memo': '備考'
  };

  const valMap = {
    'yes': 'あり', 'no': 'なし',
    'prefer': 'ジェネリック希望', 'avoid': '先発希望', 'ag': '先発（AGなら希望）',
    'either': 'どちらでもよい',
    'none': 'なし', 'occasionally': '時々', 'daily': '毎日',
    'pregnant': '妊娠中', 'breastfeeding': '授乳中', 'pediatric': '小児',
    'paper': '紙', 'digital': '電子',
    'cold': '風邪薬', 'pain': '痛み止め', 'rhinitis': '鼻炎薬', 'stomach': '胃腸薬',
    'constipation': '便秘薬', 'kanpo': '漢方薬', 'eye': '目薬', 'vitamin': 'ビタミン',
    'multi-mineral': 'マルチミネラル', 'iron': '鉄', 'zinc': '亜鉛',
    'magnesium': 'マグネシウム', 'calcium': 'カルシウム', 'dha-epa': 'DHA/EPA', 'protein': 'プロテイン',
    'coffee-tea': 'コーヒー・紅茶', 'grapefruit': 'グレープフルーツジュース', 'dairy': '乳製品',
    'hayfever': '花粉症', 'housedust': 'ハウスダスト', 'mite': 'ダニ',
    'dog-cat': '犬・猫', 'temp': '寒暖差', 'perennial': '通年性', 'testing': 'アレルギー検査中',
    'hypertension': '高血圧', 'diabetes': '糖尿病', 'heart': '心臓病',
    'kidney': '腎臓病', 'liver': '肝臓病', 'asthma': '喘息',
    'epilepsy': 'てんかん', 'glaucoma': '緑内障', 'prostate': '前立腺肥大',
    'other': 'その他',
    'sugi': 'スギ', 'hinoki': 'ヒノキ', 'ine': 'イネ', 'butakusa': 'ブタクサ', 'kamogaya': 'カモガヤ',
    'true': 'あり', 'false': 'なし'
  };

  const translateValue = (val) => {
    if (val === null || val === undefined) return 'なし';
    if (val === '') return 'なし';
    if (Array.isArray(val)) {
      if (val.length === 0) return 'なし';
      return val.map(v => valMap[String(v)] || String(v)).join('、');
    }
    if (typeof val === 'boolean') return val ? 'あり' : 'なし';
    if (typeof val === 'number') return String(val);
    return valMap[String(val)] || String(val);
  };

  const translated = {};
  for (const key in data) {
    const jpKey = keyMap[key] || key;
    translated[jpKey] = translateValue(data[key]);
  }
  return translated;
}

function doGet() {
  return HtmlService.createTemplateFromFile('index').evaluate().setTitle('Pharma AI Tools').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) { return HtmlService.createHtmlOutputFromFile(filename).getContent(); }
