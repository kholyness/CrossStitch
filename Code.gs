// =====================================================
// НАСТРОЙКИ — замени на свои значения
// =====================================================
const TOKEN = "YOUR_BOT_TOKEN";
const SHEET_ID = "YOUR_SHEET_ID";
const TZ = "GMT+1";

// =====================================================
// Telegram Bot webhook handler
// =====================================================
function doPost(e) {
  try {
    const contents = JSON.parse(e.postData.contents);
    const chatId = contents.message.chat.id;
    const text = contents.message.text ? contents.message.text.toString().replace(",", ".") : "";

    const ss = SpreadsheetApp.openById(SHEET_ID);
    const logSheet = ss.getSheetByName("Крестики");
    const projectSheet = ss.getSheetByName("Проекты");
    const fullRange = projectSheet.getRange("A2:P50").getValues();

    const today = new Date();
    const todayStr = Utilities.formatDate(today, TZ, "dd.MM.yyyy");

    const activeProjects = fullRange
      .filter(row => {
        let name = row[1] ? row[1].toString().trim() : "";
        let finishDate = row[5];
        let progress = parseFloat(row[10]);
        return name !== "" && finishDate !== "" && (isNaN(progress) || progress < 1);
      })
      .map(row => row[1].toString().trim());

    // --- 📊 ИТОГИ ---
    if (text === "📊 ИТОГИ") {
      let startMonday = getWeekStart(today);
      let endSunday = new Date(startMonday);
      endSunday.setDate(startMonday.getDate() + 6);
      endSunday.setHours(23, 59, 59, 999);

      const logData = logSheet.getRange("A2:C" + logSheet.getLastRow()).getValues();
      let stats = {};
      let totalSum = 0;

      for (let i = 0; i < logData.length; i++) {
        let entryDate = parseDate(logData[i][0]);
        if (!entryDate) continue;
        if (entryDate >= startMonday && entryDate <= endSunday) {
          let proj = logData[i][1].toString().trim();
          let count = parseFloat(logData[i][2]) || 0;
          stats[proj] = (stats[proj] || 0) + count;
          totalSum += count;
        }
      }

      let dateRange = Utilities.formatDate(startMonday, TZ, "dd.MM") + " - " + Utilities.formatDate(endSunday, TZ, "dd.MM");
      let report = "Отчет за неделю (" + dateRange + "):\n\n";
      let hasData = false;
      for (let proj in stats) {
        if (stats[proj] > 0) {
          let finishMark = "";
          for (let j = 0; j < fullRange.length; j++) {
            if (fullRange[j][1].toString().trim() === proj && fullRange[j][10] >= 1) {
              finishMark = " — Финиш! ✅";
              break;
            }
          }
          report += proj + ": " + stats[proj] + " кр." + finishMark + "\n";
          hasData = true;
        }
      }
      sendMessage(chatId, hasData ? report + "\nВсего: " + totalSum + " кр." : "За эту неделю (" + dateRange + ") записей пока нет.");
      return;
    }

    // --- 📅 ПЛАН ---
    if (text === "📅 ПЛАН") {
      let report = "📊 *Осталось по плану:*\n\n";
      let found = false;
      for (let i = 0; i < fullRange.length; i++) {
        let row = fullRange[i];
        let name = row[1] ? row[1].toString().trim() : "";
        let weeklyNorm = parseFloat(row[14]);
        let leftWeek = parseFloat(row[15]);
        let progress = row[10];
        if (name !== "" && !isNaN(weeklyNorm) && weeklyNorm > 0) {
          let status = (progress >= 1) ? "Финиш! ✅" : (leftWeek > 0 ? `*${leftWeek}* кр.` : `✅ *ГОТОВО*`);
          report += `• *${name}*: ${status}\n`;
          found = true;
        }
      }
      sendMessage(chatId, found ? report : "Плана на неделю нет! ✨");
      return;
    }

    // --- 🎡 ФОРТУНА ---
    if (text === "🎡 ФОРТУНА") {
      if (activeProjects.length === 0) {
        sendMessage(chatId, "Нет активных проектов! 🤷‍♀️");
        return;
      }
      const randomProject = activeProjects[Math.floor(Math.random() * activeProjects.length)];
      PropertiesService.getScriptProperties().setProperty('lastProject_' + chatId, randomProject);
      sendMessage(chatId, `🎡 Фортуна выбрала: *${randomProject}*!\n\nСколько сегодня вышьем?`);
      return;
    }

    // --- ЗАПИСЬ КРЕСТИКОВ ---
    if (!isNaN(text) && text !== "" && text !== null) {
      const lastProject = PropertiesService.getScriptProperties().getProperty('lastProject_' + chatId);
      if (!lastProject) {
        sendMessage(chatId, "Сначала выбери проект! 👇");
        sendProjectButtons(chatId, activeProjects);
        return;
      }
      const numValue = Number(text);
      const logData = logSheet.getRange("A:C").getDisplayValues();
      let rowIndex = -1;
      for (let i = 0; i < logData.length; i++) {
        if (logData[i][0] === todayStr && logData[i][1].toLowerCase() === lastProject.toLowerCase()) {
          rowIndex = i + 1;
          break;
        }
      }
      if (rowIndex !== -1) logSheet.getRange(rowIndex, 3).setValue(numValue);
      else logSheet.appendRow([todayStr, lastProject, numValue]);

      SpreadsheetApp.flush();
      const updatedData = projectSheet.getRange("B2:P50").getValues();
      let resMsg = "";
      for (let i = 0; i < updatedData.length; i++) {
        if (updatedData[i][0].toString().trim().toLowerCase() === lastProject.toLowerCase()) {
          let rem = parseFloat(updatedData[i][14]) || 0;
          let prog = updatedData[i][9];
          resMsg = (prog >= 1) ? "\n*ФИНИШ! ✅*" : (rem > 0 ? `\nОсталось до нормы: *${rem}* кр.` : `\n🎉 Недельная норма выполнена!`);
          break;
        }
      }
      sendMessage(chatId, `✅ *${lastProject}*: *${numValue}* кр.${resMsg}`);
      return;
    }

    const origText = contents.message.text;
    if (activeProjects.includes(origText)) {
      PropertiesService.getScriptProperties().setProperty('lastProject_' + chatId, origText);
      sendMessage(chatId, `Выбран: *${origText}*.\nЖду крестики!`);
    } else {
      sendProjectButtons(chatId, activeProjects);
    }
  } catch (err) {
    Logger.log("doPost error: " + err);
  }
}

// =====================================================
// Проверка подписи Telegram initData
// =====================================================
function verifyInitData(initData) {
  if (!initData) return { ok: false, reason: 'empty' };

  const parts = initData.split('&');
  const data = {};
  let hash = '';

  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx);
    const value = decodeURIComponent(part.slice(eqIdx + 1));
    if (key === 'hash') hash = value;
    else data[key] = value;
  }

  if (!hash) return { ok: false, reason: 'no_hash' };

  const checkString = Object.keys(data).sort().map(function(k) { return k + '=' + data[k]; }).join('\n');

  const secretKey = Utilities.computeHmacSignature(
    Utilities.MacAlgorithm.HMAC_SHA_256,
    TOKEN,
    'WebAppData'
  );
  // GAS V8 возвращает number[] — конвертируем в Byte[] через base64 round-trip
  const secretKeyBytes = Utilities.base64Decode(Utilities.base64Encode(secretKey));
  const expected = Utilities.computeHmacSignature(
    Utilities.MacAlgorithm.HMAC_SHA_256,
    checkString,
    secretKeyBytes
  );
  const expectedHex = expected.map(function(b) {
    return ('0' + (b & 0xFF).toString(16)).slice(-2);
  }).join('');

  if (expectedHex !== hash) {
    return { ok: false, reason: 'hash_mismatch', expected: expectedHex.slice(0, 8), received: hash.slice(0, 8) };
  }
  return { ok: true };
}

// =====================================================
// Mini App API — обрабатывает запросы от веб-приложения
// =====================================================
function doGet(e) {
  try {
    const auth = verifyInitData(e.parameter.initData || '');
    if (!auth.ok) {
      return ContentService
        .createTextOutput(JSON.stringify({ error: 'Unauthorized', reason: auth.reason, expected: auth.expected, received: auth.received }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  } catch (authErr) {
    Logger.log('verifyInitData error: ' + authErr);
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'AuthError', detail: authErr.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const action = e.parameter.action || '';

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const logSheet = ss.getSheetByName("Крестики");
  const projectSheet = ss.getSheetByName("Проекты");
  const fullRange = projectSheet.getRange("A2:P50").getValues();

  const today = new Date();
  const todayStr = Utilities.formatDate(today, TZ, "dd.MM.yyyy");

  let result;

  // --- GET PROJECTS ---
  if (action === 'getProjects') {
    const logData = logSheet.getRange("A:C").getDisplayValues();

    // Записи за сегодня
    let todayLog = {};
    for (let i = 1; i < logData.length; i++) {
      if (logData[i][0] === todayStr && logData[i][1]) {
        todayLog[logData[i][1].trim()] = parseFloat(logData[i][2]) || 0;
      }
    }

    const projects = fullRange
      .filter(row => {
        let name = row[1] ? row[1].toString().trim() : "";
        let finishDate = row[5];
        let progress = parseFloat(row[10]);
        return name !== "" && finishDate !== "" && (isNaN(progress) || progress < 1);
      })
      .map(row => {
        const name = row[1].toString().trim();
        return {
          name: name,
          designer: row[2] ? row[2].toString().trim() : "",
          totalStitches: parseFloat(row[7]) || 0,
          progress: parseFloat(row[10]) || 0,
          weeklyNorm: parseFloat(row[14]) || 0,
          leftWeek: parseFloat(row[15]) || 0,
          finishDate: row[5] ? Utilities.formatDate(new Date(row[5]), TZ, "dd.MM.yyyy") : "",
          todayCount: todayLog[name] || 0,
          totalRemaining: parseFloat(row[9]) || 0
        };
      });

    const inactiveProjects = fullRange
      .filter(row => {
        let name = row[1] ? row[1].toString().trim() : "";
        let finishDate = row[5];
        let progress = parseFloat(row[10]);
        return name !== "" && (finishDate === "" || finishDate == null) && (isNaN(progress) || progress < 1);
      })
      .map(row => {
        const name = row[1].toString().trim();
        return {
          name: name,
          designer: row[2] ? row[2].toString().trim() : "",
          totalStitches: parseFloat(row[7]) || 0,
          progress: parseFloat(row[10]) || 0,
          weeklyNorm: 0,
          leftWeek: 0,
          finishDate: "",
          todayCount: todayLog[name] || 0,
          totalRemaining: parseFloat(row[9]) || 0,
          inactive: true
        };
      });

    const statSheet = ss.getSheetByName("Статистика");
    const startedCount = statSheet ? statSheet.getRange("F18").getDisplayValue() : '';
    const finishedCount = statSheet ? statSheet.getRange("F19").getDisplayValue() : '';
    result = { projects: [...projects, ...inactiveProjects], todayStr: todayStr, startedCount: startedCount, finishedCount: finishedCount };

  // --- GET WEEKLY STATS ---
  } else if (action === 'getWeeklyStats') {
    let startMonday = getWeekStart(today);
    let endSunday = new Date(startMonday);
    endSunday.setDate(startMonday.getDate() + 6);
    endSunday.setHours(23, 59, 59, 999);

    const lastRow = logSheet.getLastRow();
    if (lastRow < 2) {
      result = { stats: {}, totalSum: 0, dateRange: "" };
    } else {
      const logData = logSheet.getRange("A2:C" + lastRow).getValues();
      let stats = {};
      let totalSum = 0;
      const dayTotals = new Array(7).fill(0); // 0=Пн, ..., 6=Вс

      for (let i = 0; i < logData.length; i++) {
        let entryDate = parseDate(logData[i][0]);
        if (!entryDate) continue;
        if (entryDate >= startMonday && entryDate <= endSunday) {
          let proj = logData[i][1].toString().trim();
          let count = parseFloat(logData[i][2]) || 0;
          if (proj) {
            stats[proj] = (stats[proj] || 0) + count;
            totalSum += count;
            // getDay(): 0=Вс, 1=Пн, ..., 6=Сб → переводим в 0=Пн..6=Вс
            let jsDay = entryDate.getDay();
            let dayIdx = jsDay === 0 ? 6 : jsDay - 1;
            dayTotals[dayIdx] += count;
          }
        }
      }

      // Добавляем норму из таблицы проектов
      let statsWithNorm = {};
      for (let proj in stats) {
        let norm = 0;
        for (let i = 0; i < fullRange.length; i++) {
          if (fullRange[i][1] && fullRange[i][1].toString().trim() === proj) {
            norm = parseFloat(fullRange[i][14]) || 0;
            break;
          }
        }
        statsWithNorm[proj] = { done: stats[proj], norm: norm };
      }

      let dateRange = Utilities.formatDate(startMonday, TZ, "dd.MM") + " – " + Utilities.formatDate(endSunday, TZ, "dd.MM");
      result = { stats: statsWithNorm, totalSum: totalSum, dateRange: dateRange, dayTotals: dayTotals };
    }

  // --- LOG STITCHES ---
  } else if (action === 'logStitches') {
    const project = e.parameter.project || '';
    const count = parseFloat((e.parameter.count || '0').replace(',', '.'));

    if (!project || isNaN(count) || count < 0) {
      result = { error: 'Неверные параметры' };
    } else {
      const logData = logSheet.getRange("A:C").getDisplayValues();
      let rowIndex = -1;
      for (let i = 0; i < logData.length; i++) {
        if (logData[i][0] === todayStr && logData[i][1].toLowerCase() === project.toLowerCase()) {
          rowIndex = i + 1;
          break;
        }
      }
      if (rowIndex !== -1) {
        logSheet.getRange(rowIndex, 3).setValue(count);
      } else {
        logSheet.appendRow([todayStr, project, count]);
      }
      SpreadsheetApp.flush();

      // Возвращаем обновлённые данные проекта
      const updatedData = projectSheet.getRange("B2:P50").getValues();
      let leftWeek = 0, progress = 0;
      for (let i = 0; i < updatedData.length; i++) {
        if (updatedData[i][0].toString().trim().toLowerCase() === project.toLowerCase()) {
          leftWeek = parseFloat(updatedData[i][14]) || 0;
          progress = parseFloat(updatedData[i][9]) || 0;
          break;
        }
      }
      result = { success: true, leftWeek: leftWeek, progress: progress, count: count };
    }

  // --- GET YEARLY STATS ---
  } else if (action === 'getYearlyStats') {
    const year = today.getFullYear();
    const lastRow = logSheet.getLastRow();
    const statSheet = ss.getSheetByName("Статистика");
    if (lastRow < 2) {
      result = {
        months: [], year: year,
        currentStreak: statSheet ? statSheet.getRange("K7").getDisplayValue() : '',
        maxStreak: statSheet ? statSheet.getRange("K10").getDisplayValue() : '',
        finishYear: statSheet ? statSheet.getRange("K13").getDisplayValue() : '',
        daysNoStitch: statSheet ? statSheet.getRange("K4").getDisplayValue() : '',
        medianPerDay: statSheet ? statSheet.getRange("I10").getDisplayValue() : ''
      };
    } else {
      const logData = logSheet.getRange("A2:C" + lastRow).getValues();
      const monthTotals = new Array(12).fill(0);

      for (let i = 0; i < logData.length; i++) {
        let entryDate = parseDate(logData[i][0]);
        if (!entryDate) continue;
        if (entryDate.getFullYear() === year) {
          let count = parseFloat(logData[i][2]) || 0;
          monthTotals[entryDate.getMonth()] += count;
        }
      }

      const months = monthTotals.map((total, idx) => ({ month: idx + 1, total: total }));
      const totalYear = monthTotals.reduce((a, b) => a + b, 0);
      const currentStreak = statSheet ? statSheet.getRange("K7").getDisplayValue() : '';
      const maxStreak = statSheet ? statSheet.getRange("K10").getDisplayValue() : '';
      const finishYear = statSheet ? statSheet.getRange("K13").getDisplayValue() : '';
      const daysNoStitch = statSheet ? statSheet.getRange("K4").getDisplayValue() : '';
      const medianPerDay = statSheet ? statSheet.getRange("I10").getDisplayValue() : '';
      result = { months: months, year: year, totalYear: totalYear, currentStreak: currentStreak, maxStreak: maxStreak, finishYear: finishYear, daysNoStitch: daysNoStitch, medianPerDay: medianPerDay };
    }

  // --- ADD PROJECT ---
  } else if (action === 'addProject') {
    const name = (e.parameter.name || '').trim();
    const designer = (e.parameter.designer || '').trim();
    const totalStitches = parseFloat(e.parameter.totalStitches || '') || 0;
    const finishDateStr = (e.parameter.finishDate || '').trim(); // "YYYY-MM-DD"

    if (!name) {
      result = { error: 'Название не указано' };
    } else {
      const colB = projectSheet.getRange("B2:B50").getValues();
      // Проверяем нет ли уже такого проекта
      for (let i = 0; i < colB.length; i++) {
        if (colB[i][0] && colB[i][0].toString().trim().toLowerCase() === name.toLowerCase()) {
          result = { error: 'Проект с таким названием уже существует' };
          break;
        }
      }
      if (!result) {
        let emptyRow = -1;
        for (let i = 0; i < colB.length; i++) {
          if (!colB[i][0] || colB[i][0].toString().trim() === '') {
            emptyRow = i + 2;
            break;
          }
        }
        if (emptyRow === -1) {
          result = { error: 'Нет свободных строк в таблице (максимум 49 проектов)' };
        } else {
          let finishDate;
          if (finishDateStr) {
            const parts = finishDateStr.split('-');
            finishDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
          } else {
            finishDate = new Date(2099, 11, 31);
          }
          projectSheet.getRange(emptyRow, 2).setValue(name);        // B — название
          if (designer) projectSheet.getRange(emptyRow, 3).setValue(designer);   // C — дизайнер
          projectSheet.getRange(emptyRow, 5).setValue(today);        // E — дата начала (сегодня)
          projectSheet.getRange(emptyRow, 6).setValue(finishDate);   // F — дата завершения
          if (totalStitches > 0) projectSheet.getRange(emptyRow, 8).setValue(totalStitches); // H — общее кол-во крестиков
          SpreadsheetApp.flush();
          // Читаем рассчитанную норму из формулы
          const weeklyNorm = parseFloat(projectSheet.getRange(emptyRow, 15).getValue()) || 0;
          result = { success: true, weeklyNorm: weeklyNorm };
        }
      }
    }

  // --- UPDATE PROJECT ---
  } else if (action === 'updateProject') {
    const originalName = (e.parameter.originalName || '').trim();
    const name = (e.parameter.name || '').trim();
    const designer = (e.parameter.designer || '').trim();
    const totalStitches = parseFloat(e.parameter.totalStitches || '') || 0;
    const finishDateStr = (e.parameter.finishDate || '').trim(); // "YYYY-MM-DD"

    if (!originalName || !name) {
      result = { error: 'Параметры не указаны' };
    } else {
      const colB = projectSheet.getRange("B2:B50").getValues();
      let targetRow = -1;
      for (let i = 0; i < colB.length; i++) {
        if (colB[i][0] && colB[i][0].toString().trim().toLowerCase() === originalName.toLowerCase()) {
          targetRow = i + 2;
          break;
        }
      }
      if (targetRow === -1) {
        result = { error: 'Проект не найден' };
      } else {
        projectSheet.getRange(targetRow, 2).setValue(name);          // B — название
        projectSheet.getRange(targetRow, 3).setValue(designer);      // C — дизайнер
        if (totalStitches > 0) projectSheet.getRange(targetRow, 8).setValue(totalStitches); // H — крестики
        if (finishDateStr) {
          const parts = finishDateStr.split('-');
          const finishDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
          projectSheet.getRange(targetRow, 6).setValue(finishDate);  // F — дата завершения
        }
        SpreadsheetApp.flush();
        // Читаем рассчитанную норму из формулы
        const weeklyNorm = parseFloat(projectSheet.getRange(targetRow, 15).getValue()) || 0;
        result = { success: true, weeklyNorm: weeklyNorm };
      }
    }

  // --- GET RECENT LOG ---
  } else if (action === 'getRecentLog') {
    let startMonday = getWeekStart(today);

    const lastRow = logSheet.getLastRow();
    if (lastRow < 2) {
      result = { entries: [] };
    } else {
      const logData = logSheet.getRange("A2:C" + lastRow).getValues();
      let entries = [];
      for (let i = 0; i < logData.length; i++) {
        let entryDate = parseDate(logData[i][0]);
        if (!entryDate) continue;
        if (entryDate >= startMonday) {
          let dateStr = logData[i][0] instanceof Date
            ? Utilities.formatDate(logData[i][0], TZ, 'dd.MM.yyyy')
            : logData[i][0].toString();
          let proj = logData[i][1] ? logData[i][1].toString().trim() : '';
          if (proj) {
            entries.push({ date: dateStr, project: proj, count: parseFloat(logData[i][2]) || 0 });
          }
        }
      }
      entries.sort((a, b) => {
        let [da, ma, ya] = a.date.split('.').map(Number);
        let [db, mb, yb] = b.date.split('.').map(Number);
        return new Date(yb, mb - 1, db) - new Date(ya, ma - 1, da);
      });
      result = { entries: entries };
    }

  // --- EDIT LOG ENTRY ---
  } else if (action === 'editLogEntry') {
    const date = (e.parameter.date || '').trim();
    const project = (e.parameter.project || '').trim();
    const count = parseFloat((e.parameter.count || '0').replace(',', '.'));

    if (!date || !project || isNaN(count) || count < 0) {
      result = { error: 'Неверные параметры' };
    } else {
      const logData = logSheet.getRange('A:C').getDisplayValues();
      let rowIndex = -1;
      for (let i = 0; i < logData.length; i++) {
        if (logData[i][0] === date && logData[i][1].toLowerCase() === project.toLowerCase()) {
          rowIndex = i + 1;
          break;
        }
      }
      if (rowIndex === -1) {
        result = { error: 'Запись не найдена' };
      } else {
        logSheet.getRange(rowIndex, 3).setValue(count);
        SpreadsheetApp.flush();
        result = { success: true };
      }
    }

  // --- FINISH PROJECT (log remaining stitches → progress becomes 100%) ---
  } else if (action === 'finishProject') {
    const name = (e.parameter.name || '').trim();
    if (!name) {
      result = { error: 'Название не указано' };
    } else {
      const colB = projectSheet.getRange("B2:B50").getValues();
      let targetRow = -1;
      for (let i = 0; i < colB.length; i++) {
        if (colB[i][0] && colB[i][0].toString().trim().toLowerCase() === name.toLowerCase()) {
          targetRow = i + 2;
          break;
        }
      }
      if (targetRow === -1) {
        result = { error: 'Проект не найден' };
      } else {
        const projectData = projectSheet.getRange(targetRow, 1, 1, 16).getValues()[0];
        const totalStitches = parseFloat(projectData[7]) || 0;  // H
        const remaining = parseFloat(projectData[9]) || 0;       // J
        if (totalStitches <= 0) {
          result = { error: 'Укажи общее количество крестиков в настройках проекта' };
        } else if (remaining <= 0) {
          result = { error: 'Проект уже на 100%' };
        } else {
          // Найти или создать запись за сегодня и добавить остаток
          const logData = logSheet.getRange("A:C").getDisplayValues();
          let rowIndex = -1;
          let existingCount = 0;
          for (let i = 0; i < logData.length; i++) {
            if (logData[i][0] === todayStr && logData[i][1].toLowerCase() === name.toLowerCase()) {
              rowIndex = i + 1;
              existingCount = parseFloat(logData[i][2]) || 0;
              break;
            }
          }
          const newCount = existingCount + remaining;
          if (rowIndex !== -1) {
            logSheet.getRange(rowIndex, 3).setValue(newCount);
          } else {
            logSheet.appendRow([todayStr, name, newCount]);
          }
          // Дата финиша → сегодня
          projectSheet.getRange(targetRow, 6).setValue(today);
          // Очистить A, N, O, P, Q (1, 14, 15, 16, 17)
          projectSheet.getRange(targetRow, 1).clearContent();
          projectSheet.getRange(targetRow, 14, 1, 4).clearContent();
          SpreadsheetApp.flush();
          result = { success: true, added: remaining };
        }
      }
    }

  } else {
    result = { error: 'Неизвестный action' };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// =====================================================
// Вспомогательные функции
// =====================================================
function parseDate(raw) {
  if (!raw) return null;
  if (raw instanceof Date) return raw;
  const parts = raw.toString().split('.');
  if (parts.length < 3) return null;
  return new Date(parts[2], parts[1] - 1, parts[0]);
}

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}

function sendProjectButtons(chatId, projects) {
  // Кнопка открытия Mini App
  const miniAppUrl = "https://kholyness.github.io/CrossStitch/";

  const keyboard = [
    [{ text: "🧵 Открыть приложение", web_app: { url: miniAppUrl } }],
    [{ text: "📅 ПЛАН" }, { text: "📊 ИТОГИ" }, { text: "🎡 ФОРТУНА" }]
  ];
  for (let i = 0; i < projects.length; i += 2) {
    const row = [{ text: projects[i] }];
    if (projects[i + 1]) row.push({ text: projects[i + 1] });
    keyboard.push(row);
  }
  callApi({
    method: "sendMessage",
    chat_id: String(chatId),
    text: "Что вышиваем сегодня? 👇",
    parse_mode: "Markdown",
    reply_markup: JSON.stringify({ keyboard: keyboard, resize_keyboard: true })
  });
}

function sendMessage(chatId, text) {
  callApi({ method: "sendMessage", chat_id: String(chatId), text: text, parse_mode: "Markdown" });
}

function callApi(payload) {
  UrlFetchApp.fetch("https://api.telegram.org/bot" + TOKEN + "/" + payload.method, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload)
  });
}
