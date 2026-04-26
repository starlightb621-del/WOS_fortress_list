function doGet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = ss.getSheetByName("참여자목록");
  const participationSheet = ss.getSheetByName("참여현황");

  const masterData = masterSheet.getDataRange().getValues();
  const master = masterData.slice(1).map(row => ({
    name: row[0], // A열: 이름
    grade: row[1], // B열: 등급
    role: row[2] // C열: 분류
  }));

  const participationData = participationSheet.getDataRange().getValues();
  const participation = participationData.slice(1)
    .filter(row => row[0]) // 시간대가 있는 행만
    .map(row => ({
      시간대: row[0],
      번호: row[1],
      이름: row[2],
      분류: row[3],
      업데이트시간: row[4]
    }));

  return ContentService.createTextOutput(JSON.stringify({ master, participation }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = ss.getSheetByName("참여자목록");
  const participationSheet = ss.getSheetByName("참여현황");

  if (data.action === "saveParticipation") {
    const time = data.time;
    const list = data.list; // [{name, role}]

    // 1. 기존 데이터 로드 및 해당 시간대 데이터 제외 필터링
    const lastRow = participationSheet.getLastRow();
    let newData = [];
    
    if (lastRow > 1) {
      const existingData = participationSheet.getRange(2, 1, lastRow - 1, 5).getValues();
      // 해당 시간대가 아닌 데이터들만 남김
      newData = existingData.filter(row => row[0] !== time);
    }

    // 2. 새로운 데이터(현재 스캔된 명단) 추가
    const now = new Date();
    const timestamp = Utilities.formatDate(now, "GMT+9", "yyyy-MM-dd HH:mm");
    
    list.forEach((item, index) => {
      newData.push([
        time,
        index + 1,
        item.name,
        item.role,
        timestamp
      ]);
    });

    // 3. 시트 초기화 후 한꺼번에 쓰기 (성능 및 안정성 개선)
    if (participationSheet.getLastRow() > 1) {
      participationSheet.getRange(2, 1, participationSheet.getLastRow() - 1, 5).clearContent();
    }
    
    if (newData.length > 0) {
      participationSheet.getRange(2, 1, newData.length, 5).setValues(newData);
    }

    return ContentService.createTextOutput("Success");
  }

  if (data.action === "addRow") {
    masterSheet.appendRow([data.name, data.grade, data.role]);
    return ContentService.createTextOutput("Success");
  }

  if (data.action === "updateCell") {
    const colMap = { "name": 1, "grade": 2, "role": 3 };
    const colIndex = colMap[data.field];
    if (colIndex) {
      masterSheet.getRange(data.rowIndex + 2, colIndex).setValue(data.value);
    }
    return ContentService.createTextOutput("Success");
  }

  if (data.action === "deleteRow") {
    masterSheet.deleteRow(data.rowIndex + 2);
    return ContentService.createTextOutput("Success");
  }
}
